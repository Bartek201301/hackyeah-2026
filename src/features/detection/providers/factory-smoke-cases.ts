import "server-only";
import { randomUUID } from "node:crypto";
import policyExample from "../../../../docs/contracts/policy.example.json";
import type { GatewayPolicy, GenerationPort } from "@/shared/contracts";
import { createDetectionPort, createGenerationPort } from "../index";
import { ProviderFailure } from "./validation";

/** Manual provider capability checks through the public G2 factories, not a gateway acceptance run. */
export async function runFactorySmoke() {
  if (!process.env.LAYA_API_KEY) {
    console.error("factory smoke: LAYA_API_KEY missing; supply it privately in the process environment");
    process.exitCode = 1;
    return;
  }
  const policy = policyExample as GatewayPolicy;
  const signal = new AbortController().signal;
  const detection = createDetectionPort();
  const generation = createGenerationPort();
  console.log(
    JSON.stringify({ at: new Date().toISOString(), kind: "local-factory-synthetic-capability-only" }),
  );
  async function assess(label: string, text: string) {
    const result = await detection.assess(
      { call_id: randomUUID(), text, operation: "chat", audience: "public" },
      policy,
      signal,
    );
    console.log(
      JSON.stringify({
        assessment: label,
        status: result.semantic.status,
        checkpoint_revision: result.semantic.checkpoint_revision,
        windows_completed: result.semantic.windows_completed,
        coverage_complete: result.semantic.coverage_complete,
        coverage_ranges: result.semantic.coverage_ranges,
        text_sha256: result.semantic.text_sha256,
        semantic_input_tokens: result.semantic_input_tokens,
        semantic_ms: result.semantic_ms,
        adapter_findings: result.findings.length,
      }),
    );
  }
  async function generate(label: string, content: string) {
    const input: Parameters<GenerationPort["generate"]>[0] = {
      call_id: randomUUID(),
      messages: [{ role: "user", content }],
      tools: [],
      limits: { ...policy.execution, max_output_tokens: 64 },
    };
    const result = await generation.generate(input, signal);
    console.log(
      JSON.stringify({
        generation: label,
        finished: result.finished,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        duration_ms: result.duration_ms,
        model_digest: result.model_digest,
        returned_text_bytes: Buffer.byteLength(result.text),
        tool_count: result.tool_calls.length,
      }),
    );
    return result;
  }
  try {
    await assess("synthetic_input", "Synthetic public report: revenue increased by 12 percent.");
    const normal = await generate("short", "Reply with exactly: Synthetic hello.");
    if (!normal.finished) throw new ProviderFailure("incomplete");
    await assess("synthetic_generation_output", normal.text);
    const capped = await generate(
      "output_cap",
      "Write a numbered list with 500 distinct entries describing synthetic colors. Do not stop early.",
    );
    if (capped.finished || capped.text !== "" || capped.tool_calls.length !== 0)
      throw new ProviderFailure("invalid_response");
  } catch (error) {
    console.error(
      JSON.stringify({
        factory_smoke_failed: error instanceof ProviderFailure ? error.code : "unavailable",
        input_tokens: error instanceof ProviderFailure ? error.input_tokens : null,
        output_tokens: error instanceof ProviderFailure ? error.output_tokens : null,
      }),
    );
    process.exitCode = 1;
  }
}
