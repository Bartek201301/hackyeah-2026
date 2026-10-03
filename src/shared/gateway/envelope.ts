import "server-only";
import type { ApiResponse, Assessment, ErrorCode, Usage } from "@/shared/contracts";
import type { Outcome } from "./ports";

export class GatewayError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GatewayError";
  }
}

export const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CANCELLED: 409,
  UNSUPPORTED_FILE: 415,
  RATE_LIMITED: 429,
  BUDGET_EXHAUSTED: 429,
  POLICY_UNAVAILABLE: 503,
  SEMANTIC_UNAVAILABLE: 503,
  MODEL_UNAVAILABLE: 503,
  AUDIT_UNAVAILABLE: 503,
  STATE_UNAVAILABLE: 503,
  INCOMPLETE: 503,
};

// Fixed text only: never database detail or input values.
export const MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "The request is not valid for this operation.",
  UNAUTHENTICATED: "Sign in to use this operation.",
  ACCESS_DENIED: "This operation is not available to your account.",
  NOT_FOUND: "No item is available for this account at that reference.",
  CONFLICT: "This request conflicts with an earlier request or the current state.",
  CANCELLED: "This run was cancelled.",
  UNSUPPORTED_FILE: "This file type is not supported.",
  RATE_LIMITED: "Too many requests. Try again later.",
  BUDGET_EXHAUSTED: "The usage budget for this period is exhausted.",
  POLICY_UNAVAILABLE: "The active policy is unavailable, so nothing was performed.",
  SEMANTIC_UNAVAILABLE: "Semantic assessment is unavailable, so nothing was released.",
  MODEL_UNAVAILABLE: "The model is unavailable, so nothing was released.",
  AUDIT_UNAVAILABLE: "The audit record is unavailable, so nothing was released.",
  STATE_UNAVAILABLE: "Required gateway state is unavailable, so nothing was performed.",
  INCOMPLETE: "The operation did not complete, so its result was not released.",
};

/** Nothing executed, so these zeros are true values, not unknowns (same rule as unavailable.ts). */
export const notExecutedUsage = (rateVersion = "none"): Usage => ({
  generation_input_tokens: 0,
  generation_output_tokens: 0,
  generation_ms: 0,
  semantic_input_tokens: 0,
  semantic_ms: 0,
  reserved_generation_tokens: 0,
  unresolved_reservation: false,
  comparison_micro_usd: 0,
  comparison_rate_version: rateVersion,
});

const noAssessment = (status: Assessment["status"]): Assessment => ({
  status,
  scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
  checkpoint_revision: null,
  windows_planned: 0,
  windows_completed: 0,
  coverage_complete: false,
  text_sha256: null,
  coverage_ranges: [],
});
export const SEMANTIC_NOT_REQUIRED = noAssessment("not_required");
export const SEMANTIC_UNAVAILABLE = noAssessment("unavailable");

export const envelope = (fields: Partial<ApiResponse> & Pick<ApiResponse, "trace_id">): ApiResponse => ({
  decision: null,
  reasons: [],
  policy_version: null,
  feed_version: null,
  semantic: SEMANTIC_NOT_REQUIRED,
  usage: notExecutedUsage(),
  timings: { total_ms: 0, deterministic_ms: 0, semantic_ms: 0, provider_ms: 0, persistence_ms: 0 },
  data: null,
  error: null,
  ...fields,
});

// 401/403/429 are deterministic refusals (BLOCK). Everything else carries no decision,
// so a 404 never signals that the object exists.
const BLOCK_STATUSES = new Set([401, 403, 429]);

export function errorOutcome(
  code: ErrorCode,
  opts: {
    trace_id?: string;
    policy_version?: number | null;
    feed_version?: number | null;
    status?: number;
    message?: string;
    reasons?: string[];
    semantic?: Assessment;
    usage?: Usage;
  } = {},
): Outcome {
  const status = opts.status ?? STATUS[code];
  return {
    status,
    body: envelope({
      // Ephemeral when not supplied: nothing persists this id.
      trace_id: opts.trace_id ?? crypto.randomUUID(),
      decision: BLOCK_STATUSES.has(status) ? "BLOCK" : null,
      reasons: opts.reasons ?? [],
      policy_version: opts.policy_version ?? null,
      feed_version: opts.feed_version ?? null,
      semantic: opts.semantic ?? (status === 503 ? SEMANTIC_UNAVAILABLE : SEMANTIC_NOT_REQUIRED),
      usage: opts.usage ?? notExecutedUsage(),
      error: { code, message: opts.message ?? MESSAGES[code], retryable: status >= 500 },
    }),
  };
}

export const toResponse = ({ status, body }: Outcome): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
