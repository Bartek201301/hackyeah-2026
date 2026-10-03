import "server-only";
import { createHash } from "node:crypto";
import type { Assessment, DetectionPort, GenerationPort } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { assessLocalWindow, generateLocal } from "./providers/clients";
import { serializeLaya } from "./providers/laya";
import { serializeOllama } from "./providers/ollama";
import { createBridgeTransport, createLoopbackTransport, type LocalTransport } from "./providers/transport";
import { inputOnly, ProviderFailure, requireValue } from "./providers/validation";

const liveFetch: typeof fetch = (input, init) => fetch(input, init);

function configuredProvider(): { bearer: string; transport: LocalTransport } | null {
  const bridgeUrl = process.env.MODEL_BRIDGE_URL;
  const bridgeToken = process.env.MODEL_BRIDGE_TOKEN;
  if (bridgeUrl && bridgeToken) {
    const transport = createBridgeTransport(bridgeUrl, bridgeToken, liveFetch);
    return transport ? { bearer: bridgeToken, transport } : null;
  }
  const bearer = process.env.LAYA_API_KEY;
  return bearer?.trim() ? { bearer, transport: createLoopbackTransport(liveFetch) } : null;
}

/** The gateway owns deterministic findings and durable accounting. */
export function createDetectionPort(): DetectionPort | null {
  const provider = configuredProvider();
  if (!provider) return null;
  return {
    async parse() {
      throw new ProviderFailure("unavailable");
    },
    async assess(input, policy, signal) {
      // Snapshot before the first await so concurrent caller mutations cannot change coverage.
      const { accepted, limits } = inputOnly(() => {
        serializeLaya(input, policy.semantic);
        requireValue(input.text.length > 0);
        return { accepted: structuredClone(input), limits: structuredClone(policy.semantic) };
      });
      if (signal.aborted) throw new ProviderFailure("cancelled");
      const observation = await assessLocalWindow(
        accepted,
        limits,
        provider.bearer,
        signal,
        provider.transport,
      );
      const fail = (code: "incomplete" | "cancelled") =>
        new ProviderFailure(code, true, observation.usage.input_tokens, observation.usage.output_tokens);
      if (signal.aborted) throw fail("cancelled");
      // Whole serialized state must fit the policy window. No splitting or silent truncation.
      if (!observation.usable || observation.usage.state_tokens > limits.window_tokens)
        throw fail("incomplete");
      const inputTokens = observation.usage.input_tokens;
      if (inputTokens === null) throw fail("incomplete");
      const semantic: Assessment = {
        status: "complete",
        scores: observation.scores,
        checkpoint_revision: observation.checkpoint_revision,
        windows_planned: 1,
        windows_completed: 1,
        coverage_complete: true,
        text_sha256: createHash("sha256").update(accepted.text, "utf8").digest("hex"),
        coverage_ranges: [
          { start_char: 0, end_char: Array.from(accepted.text).length, input_tokens: inputTokens },
        ],
      };
      // The shared range ceiling is stricter than Laya's three-row aggregate maximum.
      // Reject excess while retaining genuine usage; never divide or clamp it to fit.
      if (!check("Assessment", semantic).ok) throw fail("incomplete");
      return {
        findings: [],
        semantic,
        semantic_input_tokens: inputTokens,
        semantic_ms: observation.wall_ms,
      };
    },
  };
}

/** Reservation and at-most-once dispatch belong to the gateway. */
export function createGenerationPort(): GenerationPort | null {
  const provider = configuredProvider();
  if (!provider) return null;
  return {
    async generate(input, signal) {
      const accepted = inputOnly(() => {
        serializeOllama(input);
        return structuredClone(input);
      });
      return generateLocal(accepted, signal, provider.transport);
    },
  };
}
