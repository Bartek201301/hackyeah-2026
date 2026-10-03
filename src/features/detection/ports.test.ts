import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import policyExample from "../../../docs/contracts/policy.example.json";
import type { DetectionPort, GatewayPolicy, GenerationPort } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import * as publicApi from "./index";
import { LAYA_QUESTIONS, LAYA_REPO, LAYA_REVISION } from "./providers/laya";
import { QWEN_DIGEST, QWEN_MODEL } from "./providers/ollama";
import { ProviderFailure } from "./providers/validation";

const policy = () => structuredClone(policyExample) as GatewayPolicy;
const signal = () => new AbortController().signal;
const input = (): Parameters<DetectionPort["assess"]>[0] => ({
  call_id: "ca984d6b-7475-4aa0-baff-a4e34e21d937",
  operation: "chat",
  audience: "public",
  text: "Synthetic public report.",
});
const generationInput = (): Parameters<GenerationPort["generate"]>[0] => ({
  call_id: input().call_id,
  messages: [{ role: "user", content: "Synthetic hello." }],
  tools: [],
  limits: policy().execution,
});
const health = () => ({
  status: "ok",
  loaded: ["typed-decisions"],
  revisions: { "typed-decisions": LAYA_REVISION },
  device: "mps",
  device_is_preference: false,
  checkpoint_devices: { "typed-decisions": "mps" },
  cpu_fallbacks: { "typed-decisions": { count: 0 } },
});
const layaResponse = () => ({
  model: "laya-rl-agent",
  answers: Object.fromEntries(
    Object.keys(LAYA_QUESTIONS).map((name) => [
      name,
      { type: "noul", noul: 0.2, confidence: 0.8, answer_confidence: 0.8, action: { act_probability: 0.9 } },
    ]),
  ),
  routing: {
    model: "typed-decisions",
    repo: LAYA_REPO,
    reason: "explicit model='typed-decisions'",
    detection: null,
    workflow: null,
  },
  usage: {
    input_tokens: 199,
    output_tokens: 0,
    state_tokens: 24,
    state_tokens_dropped: 0,
    truncated: false,
    truncated_questions: [] as string[],
  },
});
const tags = () => ({ models: [{ name: QWEN_MODEL, digest: QWEN_DIGEST }] });
const qwenResponse = () => ({
  model: QWEN_MODEL,
  created_at: "2026-10-03T17:00:00Z",
  message: { role: "assistant", content: "Synthetic hello." },
  done: true,
  done_reason: "stop",
  prompt_eval_count: 23,
  eval_count: 5,
  total_duration: 2500000,
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
function provider(...responses: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(json(response));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => vi.stubEnv("LAYA_API_KEY", "synthetic-test-secret"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("exports exactly two server-only factories with the shared port signatures", () => {
  expect(Object.keys(publicApi).sort()).toEqual(["createDetectionPort", "createGenerationPort"]);
  expectTypeOf(publicApi.createDetectionPort).returns.toEqualTypeOf<DetectionPort>();
  expectTypeOf(publicApi.createGenerationPort).returns.toEqualTypeOf<GenerationPort>();
  // Vitest deliberately aliases server-only to an empty module; assert the production guard remains.
  expect(readFileSync(new URL("./index.ts", import.meta.url), "utf8")).toMatch(/^import "server-only";/);
});

describe("G2 detection factory", () => {
  it("returns schema-valid single-window metadata and genuine aggregate usage", async () => {
    const fetcher = provider(health(), layaResponse(), health());
    const accepted = { ...input(), text: "A😀e\u0301" };
    const result = await publicApi.createDetectionPort().assess(accepted, policy(), signal());
    expect(result.semantic).toEqual({
      status: "complete",
      scores: { instruction_manipulation: 0.2, sensitive_exposure: 0.2, resource_abuse: 0.2 },
      checkpoint_revision: LAYA_REVISION,
      windows_planned: 1,
      windows_completed: 1,
      coverage_complete: true,
      text_sha256: "27d657fa9cfe037d71dea1653e48317ab0046088ad199a2c6684bf5cc95392d0",
      coverage_ranges: [{ start_char: 0, end_char: 4, input_tokens: 199 }],
    });
    expect(check("Assessment", result.semantic).ok).toBe(true);
    expect(result.semantic_input_tokens).toBe(199);
    expect(result.findings).toEqual([]);
    expect(result.semantic_ms).toBeGreaterThanOrEqual(0);
    expect(result).not.toHaveProperty("decision");
    expect(fetcher).toHaveBeenCalledTimes(3);
    const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(body.state).toBe(
      JSON.stringify({ operation: "chat", audience: "public", content: accepted.text }),
    );
    expect(body.questions).toEqual(LAYA_QUESTIONS);
  });
  it("snapshots text and limits before asynchronous health work", async () => {
    const accepted = input();
    const p = policy();
    const fetcher = provider(health(), layaResponse(), health());
    const pending = publicApi.createDetectionPort().assess(accepted, p, signal());
    accepted.text = "changed after dispatch";
    p.semantic.window_tokens = 1;
    const result = await pending;
    expect(result.semantic.coverage_ranges[0].end_char).toBe("Synthetic public report.".length);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).state).toContain("Synthetic public report.");
  });
  it.each([undefined, ""])(
    "missing/empty credentials fail before dispatch and are read per assessment",
    async (key) => {
      const port = publicApi.createDetectionPort();
      vi.stubEnv("LAYA_API_KEY", key);
      const fetcher = provider();
      await expect(port.assess(input(), policy(), signal())).rejects.toMatchObject({
        code: "unavailable",
        dispatched: false,
        input_tokens: null,
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(["csv", "pdf"] as const)(
    "parsing %s is explicitly unavailable without provider dispatch",
    async (format) => {
      const fetcher = provider();
      await expect(
        publicApi
          .createDetectionPort()
          .parse({ bytes: new Uint8Array([1]), format }, policy().imports, signal()),
      ).rejects.toMatchObject({ code: "unavailable", dispatched: false });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(["", "x".repeat(131073), "\ud800"])(
    "invalid or over-wire-limit input fails without dispatch (case %#)",
    async (text) => {
      const fetcher = provider();
      await expect(
        publicApi.createDetectionPort().assess({ ...input(), text }, policy(), signal()),
      ).rejects.toMatchObject({ code: "invalid_input", dispatched: false });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects unsupported fields and invalid policy before dispatch", async () => {
    const fetcher = provider();
    await expect(
      publicApi
        .createDetectionPort()
        .assess(
          { ...input(), url: "https://untrusted.example" } as ReturnType<typeof input>,
          policy(),
          signal(),
        ),
    ).rejects.toThrow("invalid_input");
    const p = policy();
    p.semantic.timeout_ms = 10001;
    await expect(publicApi.createDetectionPort().assess(input(), p, signal())).rejects.toThrow(
      "invalid_input",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { truncated: true },
    { state_tokens_dropped: 1 },
    { truncated_questions: ["resource_abuse"] },
    { input_tokens: null },
    { input_tokens: 1025, state_tokens: 100 },
    { input_tokens: 2200, state_tokens: 701 },
  ])("rejects incomplete or over-cap assessment without losing usage: %j", async (patch) => {
    const raw = layaResponse();
    Object.assign(raw.usage, patch);
    const fetcher = provider(health(), raw, health());
    await expect(publicApi.createDetectionPort().assess(input(), policy(), signal())).rejects.toMatchObject({
      code: "incomplete",
      dispatched: true,
      input_tokens: raw.usage.input_tokens,
      output_tokens: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("accepts the exact shared aggregate coverage ceiling without division", async () => {
    const raw = layaResponse();
    raw.usage.input_tokens = 1024;
    provider(health(), raw, health());
    const result = await publicApi.createDetectionPort().assess(input(), policy(), signal());
    expect(result.semantic_input_tokens).toBe(1024);
    expect(result.semantic.coverage_ranges[0].input_tokens).toBe(1024);
  });
  it("honors lower policy windows using measured whole-state tokens", async () => {
    const raw = layaResponse();
    raw.usage.state_tokens = 65;
    raw.usage.input_tokens = 250;
    provider(health(), raw, health());
    const p = policy();
    p.semantic.window_tokens = 64;
    p.semantic.overlap_tokens = 0;
    await expect(publicApi.createDetectionPort().assess(input(), p, signal())).rejects.toMatchObject({
      code: "incomplete",
      input_tokens: 250,
    });
  });
  it("rejects malformed scores without returning an assessment or leaking raw values", async () => {
    const raw = layaResponse();
    Object.assign(raw.answers.resource_abuse, { noul: "protected-value" });
    provider(health(), raw);
    await expect(publicApi.createDetectionPort().assess(input(), policy(), signal())).rejects.toMatchObject({
      message: "invalid_response",
      input_tokens: 199,
      dispatched: true,
    });
  });
  it("wrong revision blocks inference; revision drift retains consumed usage", async () => {
    const wrong = health();
    wrong.revisions["typed-decisions"] = "wrong";
    const fetcher = provider(wrong);
    await expect(publicApi.createDetectionPort().assess(input(), policy(), signal())).rejects.toThrow(
      "revision_mismatch",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    provider(health(), layaResponse(), wrong);
    await expect(publicApi.createDetectionPort().assess(input(), policy(), signal())).rejects.toMatchObject({
      code: "revision_mismatch",
      dispatched: true,
      input_tokens: 199,
    });
  });
  it("pre-cancellation prevents all calls", async () => {
    const fetcher = provider();
    const controller = new AbortController();
    controller.abort();
    await expect(
      publicApi.createDetectionPort().assess(input(), policy(), controller.signal),
    ).rejects.toMatchObject({ code: "cancelled", dispatched: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["timeout", "cancelled"] as const)(
    "%s during inference throws with unknown usage and no retry",
    async (reason) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const fetcher = provider(health());
      fetcher.mockImplementationOnce(() => new Promise<Response>(() => undefined));
      const p = policy();
      p.semantic.timeout_ms = 100;
      const pending = publicApi.createDetectionPort().assess(input(), p, controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({
        code: reason,
        dispatched: true,
        input_tokens: null,
        output_tokens: null,
      });
      await vi.advanceTimersByTimeAsync(1);
      if (reason === "cancelled") controller.abort();
      else await vi.advanceTimersByTimeAsync(100);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
});

describe("G2 generation factory", () => {
  it("forwards fixed requests and maps actual usage without needing a Laya credential", async () => {
    vi.stubEnv("LAYA_API_KEY", undefined);
    const fetcher = provider(tags(), qwenResponse(), tags());
    const request = generationInput();
    request.limits.max_output_tokens = 64;
    const result = await publicApi.createGenerationPort().generate(request, signal());
    expect(result).toMatchObject({
      finished: true,
      text: "Synthetic hello.",
      input_tokens: 23,
      output_tokens: 5,
      duration_ms: 2.5,
      model_digest: QWEN_DIGEST,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      model: QWEN_MODEL,
      think: false,
      stream: false,
      options: { num_ctx: 8192, num_predict: 64 },
      messages: request.messages,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves unknown counts and duration as null", async () => {
    provider(
      tags(),
      { ...qwenResponse(), prompt_eval_count: null, eval_count: null, total_duration: null },
      tags(),
    );
    await expect(
      publicApi.createGenerationPort().generate(generationInput(), signal()),
    ).resolves.toMatchObject({ input_tokens: null, output_tokens: null, duration_ms: null });
  });
  it("withholds output-cap text and keeps genuine usage", async () => {
    provider(tags(), { ...qwenResponse(), done_reason: "length", eval_count: 64 }, tags());
    await expect(
      publicApi.createGenerationPort().generate(generationInput(), signal()),
    ).resolves.toMatchObject({
      finished: false,
      text: "",
      tool_calls: [],
      input_tokens: 23,
      output_tokens: 64,
    });
  });
  it("rejects malformed output and wrong digest safely", async () => {
    provider(tags(), { ...qwenResponse(), message: { role: "assistant", content: 123 } });
    await expect(
      publicApi.createGenerationPort().generate(generationInput(), signal()),
    ).rejects.toMatchObject({ code: "invalid_response", input_tokens: 23, output_tokens: 5 });
    const fetcher = provider({ models: [{ name: QWEN_MODEL, digest: "wrong" }] });
    await expect(publicApi.createGenerationPort().generate(generationInput(), signal())).rejects.toThrow(
      "revision_mismatch",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects unsupported input and pre-cancellation without dispatch", async () => {
    const fetcher = provider();
    const request = generationInput();
    request.limits.max_output_tokens = 769;
    await expect(publicApi.createGenerationPort().generate(request, signal())).rejects.toThrow(
      "invalid_input",
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      publicApi.createGenerationPort().generate(generationInput(), controller.signal),
    ).rejects.toMatchObject({ code: "cancelled", dispatched: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["timeout", "cancelled"] as const)("%s retains unknown generation usage", async (reason) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = provider(tags());
    fetcher.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const request = generationInput();
    request.limits.provider_timeout_ms = 1000;
    const pending = publicApi.createGenerationPort().generate(request, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      code: reason,
      dispatched: true,
      input_tokens: null,
      output_tokens: null,
    });
    await vi.advanceTimersByTimeAsync(1);
    if (reason === "cancelled") controller.abort();
    else await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not invent replay protection or retry a failed dispatch", async () => {
    const fetcher = provider(tags());
    fetcher.mockRejectedValueOnce(new Error("private network detail"));
    await expect(publicApi.createGenerationPort().generate(generationInput(), signal())).rejects.toEqual(
      expect.objectContaining({
        name: "ProviderFailure",
        message: "unavailable",
        dispatched: true,
        input_tokens: null,
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new ProviderFailure("unavailable")).not.toHaveProperty("cause");
  });
});

it("rejects unknown payloads before copying them into a snapshot", async () => {
  const p = policy();
  const detectionInput = input();
  const generation = generationInput();
  const clone = vi.spyOn(globalThis, "structuredClone");
  const fetcher = provider();
  const extra = { unregistered_payload: { nested: "untrusted" } };
  await expect(
    publicApi.createDetectionPort().assess({ ...detectionInput, ...extra }, p, signal()),
  ).rejects.toThrow("invalid_input");
  await expect(
    publicApi.createGenerationPort().generate({ ...generation, ...extra }, signal()),
  ).rejects.toThrow("invalid_input");
  expect(clone).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
