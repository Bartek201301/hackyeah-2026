import "server-only";
import { randomUUID } from "node:crypto";
import policy from "../../../../docs/contracts/policy.example.json";
import type { GatewayPolicy, GenerationPort } from "@/shared/contracts";
import { assessLocalWindow, generateLocal } from "./clients";
import { validateLayaHealth } from "./laya";
import { registeredTools, validateOllamaTags } from "./ollama";
import { createLoopbackTransport, type LocalTransport } from "./transport";
import { object, ProviderFailure } from "./validation";

/** Prints safe metadata only. No answer text, arguments, prompts, credentials or raw errors. */
export async function runSyntheticSmoke() {
  const bearer = process.env.LAYA_API_KEY;
  if (!bearer) {
    console.error("smoke: LAYA_API_KEY missing; supply it privately in the process environment");
    process.exitCode = 1;
    return;
  }
  const limits = policy as GatewayPolicy;
  const signal = new AbortController().signal;
  const local = createLoopbackTransport();
  let finishReason: unknown;
  const transport: LocalTransport = async (endpoint, request) => {
    const raw = await local(endpoint, request);
    if (endpoint === "ollamaChat") finishReason = object(raw).done_reason;
    return raw;
  };
  console.log(JSON.stringify({ at: new Date().toISOString(), kind: "synthetic-provider-capability-only" }));
  try {
    const health = validateLayaHealth(
      await local("layaHealth", { bearer, signal, deadline: Date.now() + 5000 }),
    );
    console.log(JSON.stringify({ laya_health: health }));
    console.log(
      JSON.stringify({
        ollama_digest: validateOllamaTags(await local("ollamaTags", { signal, deadline: Date.now() + 5000 })),
      }),
    );
    const assessment = await assessLocalWindow(
      {
        call_id: randomUUID(),
        operation: "chat",
        audience: "public",
        text: "Synthetic public report: revenue increased by 12 percent.",
      },
      limits.semantic,
      bearer,
      signal,
      transport,
    );
    console.log(JSON.stringify({ laya: assessment }));
    if (!assessment.usable) throw new ProviderFailure("incomplete", true, assessment.usage.input_tokens);
    const input = (content: string, outputCap = 64): Parameters<GenerationPort["generate"]>[0] => ({
      call_id: randomUUID(),
      messages: [{ role: "user", content }],
      tools: [],
      limits: { ...limits.execution, max_output_tokens: outputCap },
    });
    async function generate(label: string, request: Parameters<GenerationPort["generate"]>[0]) {
      const result = await generateLocal(request, signal, transport);
      console.log(
        JSON.stringify({
          ollama: label,
          finished: result.finished,
          done_reason: finishReason === "stop" || finishReason === "length" ? finishReason : "other",
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          duration_ms: result.duration_ms,
          model_digest: result.model_digest,
          text_bytes: Buffer.byteLength(result.text),
          tool_names: result.tool_calls.map((call) => call.name),
          generated_tool_ids: result.tool_calls.every(
            (call, index) => call.id === `${request.call_id}_${index}`,
          ),
        }),
      );
      return result;
    }
    const normal = await generate("short", input("Reply with exactly: Synthetic hello."));
    if (!normal.finished) throw new ProviderFailure("incomplete");
    const capped = await generate(
      "output_cap",
      input(
        "Write a numbered list with 500 distinct entries describing synthetic colors. Do not stop early.",
      ),
    );
    if (capped.finished) throw new ProviderFailure("invalid_response");
    const toolInput = input(
      "Call search_excerpts with query public facts. Do not answer in text. Use the tool now.",
      128,
    );
    toolInput.tools = registeredTools();
    const tool = await generate("registered_tool", toolInput);
    if (!tool.finished || tool.tool_calls.length !== 1 || tool.tool_calls[0].name !== "search_excerpts")
      throw new ProviderFailure("invalid_response");
    const followup = {
      ...toolInput,
      call_id: randomUUID(),
      messages: [
        ...toolInput.messages,
        { role: "assistant" as const, content: "", tool_calls: tool.tool_calls },
        {
          role: "tool" as const,
          content:
            "Synthetic fixture result: the public report has no additional facts. Respond with a brief final summary; do not call another tool.",
          tool_call_id: tool.tool_calls[0].id,
        },
      ],
    };
    const final = await generate("synthetic_tool_result", followup);
    if (!final.finished || final.tool_calls.length !== 0) throw new ProviderFailure("invalid_response");
  } catch (error) {
    console.error(
      JSON.stringify({
        smoke_failed: error instanceof ProviderFailure ? error.code : "unavailable",
        input_tokens: error instanceof ProviderFailure ? error.input_tokens : null,
        output_tokens: error instanceof ProviderFailure ? error.output_tokens : null,
      }),
    );
    process.exitCode = 1;
  }
}
