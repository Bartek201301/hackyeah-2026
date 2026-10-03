import "server-only";
import type { ApiResponse, ErrorCode } from "@/shared/contracts";

// 503 seam: required state is unavailable, so no decision and no protected result.
// trace_id is not persisted yet (no audit store until T02/T03).
export function unavailableResponse(
  code: ErrorCode = "STATE_UNAVAILABLE",
  message = "This gateway operation is not available yet.",
): Response {
  const started = performance.now();
  const body: ApiResponse = {
    trace_id: crypto.randomUUID(),
    decision: null,
    reasons: [],
    policy_version: null,
    feed_version: null,
    semantic: {
      status: "unavailable",
      scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
      checkpoint_revision: null,
      windows_planned: 0,
      windows_completed: 0,
      coverage_complete: false,
      text_sha256: null,
      coverage_ranges: [],
    },
    // Nothing was executed, so these zeros are true values, not unknowns.
    usage: {
      generation_input_tokens: 0,
      generation_output_tokens: 0,
      generation_ms: 0,
      semantic_input_tokens: 0,
      semantic_ms: 0,
      reserved_generation_tokens: 0,
      unresolved_reservation: false,
      comparison_micro_usd: 0,
      comparison_rate_version: "none",
    },
    timings: {
      total_ms: Math.round(performance.now() - started),
      deterministic_ms: 0,
      semantic_ms: 0,
      provider_ms: 0,
      persistence_ms: 0,
    },
    data: null,
    error: { code, message, retryable: true },
  };
  return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
}
