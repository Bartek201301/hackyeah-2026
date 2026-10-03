import "server-only";
import { isDeepStrictEqual } from "node:util";
import api from "../../../../docs/contracts/openapi.json";
import type { GenerationPort, GenerationResult, RegisteredTool, ToolCall } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import {
  bytes,
  count,
  executionLimits,
  inputOnly,
  keys,
  object,
  ProviderFailure,
  requireValue,
  text,
  uuid,
} from "./validation";

export const QWEN_MODEL = "qwen3:8b";
export const QWEN_DIGEST = "500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41";
type GenerationInput = Parameters<GenerationPort["generate"]>[0];
/** Feature-private provider registry; no execution or permissions. Schemas reuse canonical fields. */
const registry: readonly RegisteredTool[] = [
  {
    name: "search_excerpts",
    description: "Search permitted excerpts for a query.",
    input_schema: api.components.schemas.SearchRequest,
  },
  {
    name: "read_excerpt",
    description: "Read a permitted excerpt by its UUID.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { id: api.components.schemas.Excerpt.properties.id },
      required: ["id"],
    },
  },
];
export function registeredTools(): RegisteredTool[] {
  return structuredClone(registry) as RegisteredTool[];
}
function toolArguments(name: unknown, raw: unknown): ToolCall["arguments"] {
  const args = object(raw);
  if (name === "search_excerpts") requireValue(check("SearchRequest", args).ok);
  else {
    requireValue(name === "read_excerpt");
    keys(args, ["id"]);
    uuid(args.id);
  }
  return args;
}
function toolId(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value));
}
export function serializeOllama(input: GenerationInput) {
  return inputOnly(() => {
    keys(object(input), ["call_id", "messages", "tools", "limits"]);
    uuid(input.call_id);
    executionLimits(input.limits);
    requireValue(Array.isArray(input.messages) && input.messages.length > 0 && input.messages.length <= 32);
    requireValue(Array.isArray(input.tools) && input.tools.length <= registry.length);
    const offered = new Set<string>();
    const tools = input.tools.map((tool) => {
      const known = registry.find((candidate) => candidate.name === tool.name);
      requireValue(
        known &&
          isDeepStrictEqual(tool, known) &&
          input.limits.allowed_tools.includes(tool.name) &&
          !offered.has(tool.name),
      );
      offered.add(tool.name);
      return {
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
      };
    });
    const pending = new Map<string, string>();
    const seen = new Set<string>();
    const messages = input.messages.map((message) => {
      keys(object(message), ["role", "content"], ["tool_calls", "tool_call_id"]);
      text(message.content);
      requireValue(["system", "user", "assistant", "tool"].includes(message.role));
      if (message.role === "tool") {
        requireValue(message.tool_calls === undefined);
        toolId(message.tool_call_id);
        const name = pending.get(message.tool_call_id);
        requireValue(name);
        pending.delete(message.tool_call_id);
        return { role: "tool", content: message.content, tool_name: name };
      }
      requireValue(pending.size === 0 && message.tool_call_id === undefined);
      if (message.tool_calls !== undefined) {
        requireValue(
          message.role === "assistant" &&
            message.content.trim() === "" &&
            Array.isArray(message.tool_calls) &&
            message.tool_calls.length > 0 &&
            message.tool_calls.length <= input.limits.max_tool_calls,
        );
        const calls = message.tool_calls.map((call: ToolCall, index: number) => {
          keys(object(call), ["id", "name", "arguments"]);
          toolId(call.id);
          requireValue(offered.has(call.name) && !seen.has(call.id));
          seen.add(call.id);
          pending.set(call.id, call.name);
          return {
            function: { index, name: call.name, arguments: toolArguments(call.name, call.arguments) },
          };
        });
        return { role: message.role, content: message.content, tool_calls: calls };
      }
      return { role: message.role, content: message.content };
    });
    requireValue(pending.size === 0);
    // Full serialized messages + schemas + tool results, not just user text.
    requireValue(bytes({ messages, tools }) <= input.limits.max_input_utf8_bytes);
    return {
      model: QWEN_MODEL,
      think: false,
      stream: false,
      messages,
      tools,
      options: { num_ctx: input.limits.context_tokens, num_predict: input.limits.max_output_tokens },
    };
  });
}
export function validateOllamaTags(raw: unknown): string {
  const tags = object(raw);
  requireValue(Array.isArray(tags.models) && tags.models.length <= 128);
  const matches = tags.models.map(object).filter((m) => m.name === QWEN_MODEL);
  requireValue(matches.length === 1 && matches[0].digest === QWEN_DIGEST, "revision_mismatch");
  return QWEN_DIGEST;
}
export function parseOllama(raw: unknown, input: GenerationInput, trustedDigest: string): GenerationResult {
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  try {
    serializeOllama(input);
    requireValue(bytes(raw) <= 65536, "body_limit");
    const root = object(raw);
    inputTokens = count(root.prompt_eval_count);
    outputTokens = count(root.eval_count);
    requireValue(trustedDigest === QWEN_DIGEST, "revision_mismatch");
    keys(
      root,
      ["model", "created_at", "message", "done"],
      [
        "done_reason",
        "total_duration",
        "load_duration",
        "prompt_eval_count",
        "prompt_eval_cached_count",
        "prompt_eval_duration",
        "eval_count",
        "eval_duration",
      ],
    );
    requireValue(
      root.model === QWEN_MODEL &&
        typeof root.created_at === "string" &&
        Number.isFinite(Date.parse(root.created_at)) &&
        typeof root.done === "boolean",
    );
    requireValue(
      root.done
        ? ["stop", "length"].includes(String(root.done_reason))
        : root.done_reason === undefined || root.done_reason === "",
    );
    for (const field of [
      "load_duration",
      "prompt_eval_cached_count",
      "prompt_eval_duration",
      "eval_duration",
    ])
      count(root[field]);
    const duration = count(root.total_duration);
    requireValue(inputTokens === null || inputTokens <= input.limits.context_tokens);
    requireValue(outputTokens === null || outputTokens <= input.limits.max_output_tokens);
    requireValue(
      inputTokens === null ||
        outputTokens === null ||
        inputTokens + outputTokens <= input.limits.context_tokens,
    );
    const message = object(root.message);
    keys(message, ["role", "content"], ["thinking", "tool_calls"]);
    requireValue(message.role === "assistant" && (message.thinking === undefined || message.thinking === ""));
    text(message.content);
    requireValue(Buffer.byteLength(message.content) <= input.limits.max_output_tokens * 16, "body_limit");
    const calls = message.tool_calls ?? [];
    requireValue(Array.isArray(calls) && calls.length <= input.limits.max_tool_calls);
    requireValue(calls.length === 0 || message.content.trim() === "");
    const ids = new Set<string>();
    const tools: ToolCall[] = calls.map((rawCall, index) => {
      const call = object(rawCall);
      keys(call, ["function"], ["id", "type"]);
      requireValue(call.type === undefined || call.type === "function");
      const fn = object(call.function);
      keys(fn, ["name", "arguments"], ["index"]);
      requireValue(fn.index === undefined || fn.index === index);
      const offered = input.tools.find((tool) => tool.name === fn.name);
      requireValue(offered);
      const id = call.id === undefined ? `${input.call_id}_${index}` : call.id;
      toolId(id);
      requireValue(!ids.has(id));
      ids.add(id);
      return { id, name: offered.name, arguments: toolArguments(fn.name, fn.arguments) };
    });
    requireValue(
      root.done !== true ||
        root.done_reason !== "stop" ||
        message.content.trim().length > 0 ||
        tools.length > 0,
    );
    const finished = root.done === true && root.done_reason === "stop";
    // Never release a partial response/tool proposal, even to an accidental downstream consumer.
    return {
      text: finished ? message.content : "",
      tool_calls: finished ? tools : [],
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: duration === null ? null : duration / 1e6,
      model_digest: trustedDigest,
      finished,
    };
  } catch (error) {
    throw new ProviderFailure(
      error instanceof ProviderFailure ? error.code : "invalid_response",
      true,
      inputTokens,
      outputTokens,
    );
  }
}
