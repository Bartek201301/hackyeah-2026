/*
 * Maps a gateway response envelope onto exactly one screen state.
 *
 * Pure module on purpose: `vitest.config.mts` is `environment: "node"` and includes only
 * `src/**` + `*.test.ts`, so this is the layer that can carry assertions today. Components stay thin
 * and call into here.
 *
 * Rules come from docs/contracts/protocols.md:
 *  - transport success is never permission; 202 means "created", not "approved";
 *  - 404 must not reveal whether an object exists;
 *  - 409 needs a fresh read, never an automatic retry;
 *  - 503 carries a service error and no decision — it is not a policy denial;
 *  - REVIEW returns a reference only, never candidate text;
 *  - an unrecognised shape fails closed.
 */
import type { ApiResponse, Decision, ErrorCode } from "@/shared/contracts";

/** Visual weight only. Never the sole carrier of meaning (DESIGN: no colour-only status). */
export type OutcomeTone = "neutral" | "brand" | "success" | "warning" | "danger";

export type OutcomeKind =
  | "progress"
  | "result"
  | "review"
  | "denied"
  | "refused"
  | "conflict"
  | "invalid"
  | "unauthenticated"
  | "notFound"
  | "unavailable"
  | "incomplete"
  | "cancelled";

export type GatewayOutcome = {
  kind: OutcomeKind;
  /** Short English heading for the state. */
  title: string;
  /** One actionable English sentence. Never echoes protected text. */
  detail: string;
  tone: OutcomeTone;
  /** True only when the gateway returned a checked, disclosable result. */
  showsResult: boolean;
  /** True when re-submitting the same action is sensible. Never true for a conflict. */
  retryable: boolean;
  /** Opaque server reason labels, max 20. Rendered as-is; never branched on. */
  reasons: readonly string[];
  decision: Decision | null;
  errorCode: ErrorCode | null;
  traceId: string | null;
};

const SERVICE_ERROR_DETAIL: Partial<Record<ErrorCode, string>> = {
  POLICY_UNAVAILABLE: "The control policy could not be read, so the request was not carried out.",
  SEMANTIC_UNAVAILABLE: "The required content assessment is unavailable, so the result is withheld.",
  MODEL_UNAVAILABLE: "The language model is unavailable, so the result is withheld.",
  AUDIT_UNAVAILABLE: "The audit record could not be written, so the request was not carried out.",
  STATE_UNAVAILABLE: "This gateway operation is not available yet.",
};

const base = (body: ApiResponse | null) => ({
  reasons: body?.reasons ?? [],
  decision: body?.decision ?? null,
  errorCode: body?.error?.code ?? null,
  traceId: body?.trace_id ?? null,
});

/** Fail-closed fallback used for unknown statuses and unparseable bodies. */
const failClosed = (body: ApiResponse | null, detail: string): GatewayOutcome => ({
  ...base(body),
  kind: "unavailable",
  title: "Request withheld",
  detail,
  tone: "danger",
  showsResult: false,
  retryable: true,
});

/**
 * Classify one response. `status` is the HTTP status; `body` is the parsed envelope when present
 * (openapi-fetch puts non-2xx envelopes on `error`, so callers pass `data ?? error`).
 */
export function classifyResponse(status: number, body: ApiResponse | null): GatewayOutcome {
  const common = base(body);
  const serverMessage = body?.error?.message;

  switch (status) {
    case 200: {
      // A terminal decision governs what may be shown — not the status code.
      switch (body?.decision) {
        case "ALLOW":
          return {
            ...common,
            kind: "result",
            title: "Answer ready",
            detail: "The gateway checked this answer before releasing it.",
            tone: "success",
            showsResult: true,
            retryable: false,
          };
        case "REDACT":
          return {
            ...common,
            kind: "result",
            title: "Answer ready, partly withheld",
            detail: "Some material was removed before release. Only checked content is shown.",
            tone: "warning",
            showsResult: true,
            retryable: false,
          };
        case "REVIEW":
          return {
            ...common,
            kind: "review",
            title: "Held for review",
            detail: "An administrator must review this before it can be released.",
            tone: "warning",
            showsResult: false,
            retryable: false,
          };
        case "BLOCK":
          return {
            ...common,
            kind: "denied",
            title: "Blocked",
            detail: "This request was refused by the control policy.",
            tone: "danger",
            showsResult: false,
            retryable: false,
          };
        default:
          // 200 with no decision is not a contract-valid governed result.
          return failClosed(body, "The gateway returned no decision, so nothing is shown.");
      }
    }

    // Created, not approved. There is no answer yet and `decision` is null by contract.
    case 202:
      return {
        ...common,
        kind: "progress",
        title: "Request accepted",
        detail: "The gateway is running its checks. Nothing is released until they finish.",
        tone: "brand",
        showsResult: false,
        retryable: false,
      };

    case 400:
    case 413:
    case 415:
      return {
        ...common,
        kind: "invalid",
        title: "Request not accepted",
        detail: serverMessage ?? "Check the submitted values and try again.",
        tone: "danger",
        showsResult: false,
        retryable: false,
      };

    case 401:
      return {
        ...common,
        kind: "unauthenticated",
        title: "Sign in required",
        detail: "Your session is missing or has expired. Sign in and try again.",
        tone: "danger",
        showsResult: false,
        retryable: false,
      };

    // Deterministic denial. Deliberately generic: never hint at what exists.
    case 403:
      return {
        ...common,
        kind: "denied",
        title: "Not permitted",
        detail: "This account is not permitted to perform this operation.",
        tone: "danger",
        showsResult: false,
        retryable: false,
      };

    // Same wording as a denial on purpose: the contract forbids revealing existence.
    case 404:
      return {
        ...common,
        kind: "notFound",
        title: "Not available",
        detail: "No item is available for this account at that reference.",
        tone: "danger",
        showsResult: false,
        retryable: false,
      };

    case 409:
      return {
        ...common,
        kind: "conflict",
        title: "Changed since you loaded it",
        detail: "Reload the current version before submitting again. Your draft is kept.",
        tone: "warning",
        showsResult: false,
        // Never retryable: resubmitting the same request would defeat the version check.
        retryable: false,
      };

    case 429:
      return {
        ...common,
        kind: "refused",
        title: "Limit reached",
        detail: serverMessage ?? "A rate, budget or loop limit refused this request.",
        tone: "danger",
        showsResult: false,
        retryable: false,
      };

    case 503: {
      const code = body?.error?.code;
      return {
        ...common,
        kind: "unavailable",
        title: "Service unavailable",
        detail:
          (code && SERVICE_ERROR_DETAIL[code]) ??
          serverMessage ??
          "A required service is unavailable, so the result is withheld.",
        tone: "danger",
        showsResult: false,
        retryable: body?.error?.retryable ?? true,
      };
    }

    default:
      return failClosed(body, `Unexpected response (${status}). Nothing is shown.`);
  }
}

/**
 * Terminal error codes can arrive on an otherwise successful poll, so they are classified from the
 * envelope rather than the status. Checked before `classifyResponse` by callers that poll.
 */
export function classifyTerminalErrorCode(body: ApiResponse | null): GatewayOutcome | null {
  const common = base(body);
  switch (body?.error?.code) {
    case "CANCELLED":
      return {
        ...common,
        kind: "cancelled",
        title: "Cancelled",
        detail: "No further work was started. Any usage already incurred is still recorded.",
        tone: "neutral",
        showsResult: false,
        retryable: false,
      };
    case "INCOMPLETE":
      return {
        ...common,
        kind: "incomplete",
        title: "Incomplete",
        detail:
          "The operation did not finish its checks, so nothing is released. Recorded usage may be uncertain.",
        tone: "warning",
        showsResult: false,
        retryable: false,
      };
    default:
      return null;
  }
}
