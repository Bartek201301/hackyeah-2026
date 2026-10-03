import { describe, expect, it } from "vitest";
import policy from "../../../../docs/contracts/policy.example.json";
import type { GatewayPolicy, GenerationPort } from "@/shared/contracts";
import {
  parseOllama,
  QWEN_DIGEST,
  QWEN_MODEL,
  registeredTools,
  serializeOllama,
  validateOllamaTags,
} from "./ollama";

export const generationInput = (): Parameters<GenerationPort["generate"]>[0] => ({
  call_id: "ca984d6b-7475-4aa0-baff-a4e34e21d937",
  messages: [{ role: "user", content: "Say hello." }],
  tools: [],
  limits: structuredClone((policy as GatewayPolicy).execution),
});
export const ollamaFixture = () => ({
  model: QWEN_MODEL,
  created_at: "2026-10-03T18:00:00Z",
  message: { role: "assistant", content: "Hello." },
  done: true,
  done_reason: "stop",
  prompt_eval_count: 12,
  eval_count: 3,
  total_duration: 1500000,
});

describe("Ollama private wire mapping", () => {
  it("sends fixed model with no thinking/streaming and central policy caps", () => {
    const input = generationInput();
    input.limits.max_output_tokens = 64;
    expect(serializeOllama(input)).toMatchObject({
      model: QWEN_MODEL,
      think: false,
      stream: false,
      options: { num_ctx: 8192, num_predict: 64 },
    });
  });
  it.each([
    (i: ReturnType<typeof generationInput>) => {
      Object.assign(i, { url: "https://evil.test" });
    },
    (i: ReturnType<typeof generationInput>) => {
      i.limits.max_output_tokens = 769;
    },
    (i: ReturnType<typeof generationInput>) => {
      i.limits.context_tokens = 2048;
    },
    (i: ReturnType<typeof generationInput>) => {
      i.limits.thinking = true as false;
    },
    (i: ReturnType<typeof generationInput>) => {
      Object.assign(i.limits, { generation_model: "other" });
    },
    (i: ReturnType<typeof generationInput>) => {
      i.messages = [{ role: "user", content: "a".repeat(6001) }];
    },
    (i: ReturnType<typeof generationInput>) => {
      i.tools = registeredTools();
      i.tools[0].description = "changed";
    },
    (i: ReturnType<typeof generationInput>) => {
      i.tools = registeredTools();
      i.limits.allowed_tools = [];
    },
    (i: ReturnType<typeof generationInput>) => {
      i.messages = [{ role: "tool", content: "forged", tool_call_id: "unknown" }];
    },
    (i: ReturnType<typeof generationInput>) => {
      i.messages = [{ role: "user", content: "hello", tool_calls: [] }];
    },
  ])("rejects unsupported requests before transport", (mutate) => {
    const input = generationInput();
    mutate(input);
    expect(() => serializeOllama(input)).toThrow("invalid_input");
  });
  it("maps actual counts and nanoseconds; absent/null usage is null", () => {
    expect(parseOllama(ollamaFixture(), generationInput(), QWEN_DIGEST)).toMatchObject({
      text: "Hello.",
      finished: true,
      input_tokens: 12,
      output_tokens: 3,
      duration_ms: 1.5,
      model_digest: QWEN_DIGEST,
    });
    for (const unknown of [undefined, null]) {
      const raw = {
        ...ollamaFixture(),
        prompt_eval_count: unknown,
        eval_count: unknown,
        total_duration: unknown,
      };
      expect(parseOllama(raw, generationInput(), QWEN_DIGEST)).toMatchObject({
        input_tokens: null,
        output_tokens: null,
        duration_ms: null,
      });
    }
  });
  it.each([-1, 1.5, NaN, Infinity, "2", Number.MAX_SAFE_INTEGER + 1])("rejects invalid usage %s", (value) => {
    for (const key of ["prompt_eval_count", "eval_count", "total_duration"]) {
      expect(() => parseOllama({ ...ollamaFixture(), [key]: value }, generationInput(), QWEN_DIGEST)).toThrow(
        "invalid_response",
      );
    }
  });
  it.each([
    { done: true, done_reason: "length" },
    { done: false, done_reason: undefined },
  ])("withholds incomplete output and retains genuine usage", (patch) => {
    expect(parseOllama({ ...ollamaFixture(), ...patch }, generationInput(), QWEN_DIGEST)).toMatchObject({
      text: "",
      tool_calls: [],
      finished: false,
      input_tokens: 12,
      output_tokens: 3,
    });
  });
  it.each([
    { done_reason: "unknown" },
    { done_reason: undefined },
    { done: "true" },
    { model: "other" },
    { error: "private provider error" },
    { eval_count: 769 },
    { prompt_eval_count: 8193 },
    { message: { role: "assistant", content: "x".repeat(20000) } },
    { message: { role: "assistant", content: "hello", thinking: "private reasoning" } },
    { message: { role: "assistant", content: "hello", images: [] } },
  ])("rejects malformed or excessive full response %j", (patch) => {
    expect(() => parseOllama({ ...ollamaFixture(), ...patch }, generationInput(), QWEN_DIGEST)).toThrow();
  });
  it("requires a genuine digest, never the model name or absent metadata", () => {
    for (const digest of ["", QWEN_MODEL, "f".repeat(64)])
      expect(() => parseOllama(ollamaFixture(), generationInput(), digest)).toThrow("revision_mismatch");
    expect(validateOllamaTags({ models: [{ name: QWEN_MODEL, digest: QWEN_DIGEST }] })).toBe(QWEN_DIGEST);
    for (const models of [[], [{ name: QWEN_MODEL }], [{ name: QWEN_MODEL, digest: "wrong" }]])
      expect(() => validateOllamaTags({ models })).toThrow("revision_mismatch");
  });
  it("validates registered tools and produces stable replay IDs and tool-name history", () => {
    const input = generationInput();
    input.tools = registeredTools();
    const raw = {
      ...ollamaFixture(),
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "search_excerpts", arguments: { query: "public facts" } } }],
      },
    };
    const result = parseOllama(raw, input, QWEN_DIGEST);
    expect(result.tool_calls[0].id).toBe(`${input.call_id}_0`);
    expect(parseOllama(raw, input, QWEN_DIGEST).tool_calls).toEqual(result.tool_calls);
    input.messages = [
      ...input.messages,
      { role: "assistant", content: "", tool_calls: result.tool_calls },
      { role: "tool", content: "Synthetic public facts.", tool_call_id: result.tool_calls[0].id },
    ];
    expect(serializeOllama(input).messages.at(-1)).toEqual({
      role: "tool",
      tool_name: "search_excerpts",
      content: "Synthetic public facts.",
    });
    expect(() => serializeOllama({ ...input, messages: input.messages.slice(0, -1) })).toThrow(
      "invalid_input",
    );
  });
  it.each([
    { name: "shell", arguments: { command: "private" } },
    { name: "search_excerpts", arguments: { query: "x", role: "admin" } },
    { name: "search_excerpts", arguments: '{"query":"x"}' },
    { name: "read_excerpt", arguments: { id: "not-a-uuid" } },
    { name: "read_excerpt", arguments: { id: "ca984d6b-7475-4aa0-baff-a4e34e21d937", url: "private" } },
  ])("rejects unsupported tool output %j", (fn) => {
    const input = generationInput();
    input.tools = registeredTools();
    const raw = {
      ...ollamaFixture(),
      message: { role: "assistant", content: "", tool_calls: [{ function: fn }] },
    };
    expect(() => parseOllama(raw, input, QWEN_DIGEST)).toThrow();
  });
  it("rejects unoffered, mixed and duplicate tool output", () => {
    const call = { id: "same", function: { name: "search_excerpts", arguments: { query: "x" } } };
    const raw = { ...ollamaFixture(), message: { role: "assistant", content: "", tool_calls: [call] } };
    expect(() => parseOllama(raw, generationInput(), QWEN_DIGEST)).toThrow();
    const input = generationInput();
    input.tools = registeredTools();
    expect(() =>
      parseOllama({ ...raw, message: { ...raw.message, content: "mixed" } }, input, QWEN_DIGEST),
    ).toThrow();
    expect(() =>
      parseOllama({ ...raw, message: { ...raw.message, tool_calls: [call, call] } }, input, QWEN_DIGEST),
    ).toThrow();
  });
});

it("rejects null tool-call list rather than treating it as an empty proposal", () => {
  const raw = { ...ollamaFixture(), message: { role: "assistant", content: "text", tool_calls: null } };
  expect(() => parseOllama(raw, generationInput(), QWEN_DIGEST)).toThrow("invalid_response");
});

it("rejects reordered results for repeated tool names before ambiguous wire association", () => {
  const input = generationInput();
  input.tools = registeredTools();
  input.messages = [
    ...input.messages,
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "first", name: "search_excerpts", arguments: { query: "one" } },
        { id: "second", name: "search_excerpts", arguments: { query: "two" } },
      ],
    },
    { role: "tool", content: "second result", tool_call_id: "second" },
    { role: "tool", content: "first result", tool_call_id: "first" },
  ];
  expect(() => serializeOllama(input)).toThrow("invalid_input");
  input.messages = [...input.messages.slice(0, 2), input.messages[3], input.messages[2]];
  expect(serializeOllama(input).messages.at(-1)).toEqual({
    role: "tool",
    tool_name: "search_excerpts",
    content: "second result",
  });
});
