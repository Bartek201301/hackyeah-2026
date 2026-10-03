/*
 * DEVELOPMENT AND TEST FIXTURES ONLY.
 *
 * These are hand-written envelopes used to exercise state mapping while `/api/v1/*` still returns
 * 503. They are imported by `*.test.ts` only — never by a component — so they cannot reach the
 * judged runtime, and they are never evidence of live behaviour.
 *
 * Shapes follow docs/contracts/openapi.json `Response`; the 503 body matches the live seam captured
 * from `POST /api/v1/chat` on 2026-10-03.
 */
import type { ApiResponse, Citation, Decision, ErrorCode, Run } from "@/shared/contracts";

const EMPTY_SEMANTIC: ApiResponse["semantic"] = {
  status: "not_required",
  scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
  checkpoint_revision: null,
  windows_planned: 0,
  windows_completed: 0,
  coverage_complete: false,
  text_sha256: null,
  coverage_ranges: [],
};

const ZERO_USAGE: ApiResponse["usage"] = {
  generation_input_tokens: 0,
  generation_output_tokens: 0,
  generation_ms: 0,
  semantic_input_tokens: 0,
  semantic_ms: 0,
  reserved_generation_tokens: 0,
  unresolved_reservation: false,
  comparison_micro_usd: 0,
  comparison_rate_version: "none",
};

const ZERO_TIMINGS: ApiResponse["timings"] = {
  total_ms: 1,
  deterministic_ms: 0,
  semantic_ms: 0,
  provider_ms: 0,
  persistence_ms: 0,
};

/** Build a fixture envelope. Everything defaults to the fail-closed shape. */
export function devEnvelope(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    trace_id: "00000000-0000-4000-8000-0000000000aa",
    decision: null,
    reasons: [],
    policy_version: null,
    feed_version: null,
    semantic: EMPTY_SEMANTIC,
    usage: ZERO_USAGE,
    timings: ZERO_TIMINGS,
    data: null,
    error: null,
    ...overrides,
  };
}

export const devDecision = (decision: Decision, reasons: string[] = []): ApiResponse =>
  devEnvelope({ decision, reasons, policy_version: 1, feed_version: 1 });

export const devError = (code: ErrorCode, message: string, retryable = false): ApiResponse =>
  devEnvelope({ error: { code, message, retryable } });

/** The live 503 seam body, as actually returned by the catch-all route today. */
export const DEV_UNAVAILABLE_SEAM: ApiResponse = devEnvelope({
  semantic: { ...EMPTY_SEMANTIC, status: "unavailable" },
  error: {
    code: "STATE_UNAVAILABLE",
    message: "This gateway operation is not available yet.",
    retryable: true,
  },
});

export const devRun = (state: Run["state"], stage: string, kind: Run["kind"] = "chat"): Run => ({
  id: "00000000-0000-4000-8000-0000000000bb",
  kind,
  state,
  stage,
});

export const devCitation = (overrides: Partial<Citation> = {}): Citation => ({
  excerpt_id: "00000000-0000-4000-8000-000000001201",
  excerpt_version: 1,
  source_label: "AsterCloud public annual report",
  source_date: "2026-03-15",
  period: "FY2025",
  locator: "row 4",
  ...overrides,
});
