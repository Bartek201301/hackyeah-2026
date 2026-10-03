/*
 * Reading the gateway envelope for an audit request.
 *
 * Three rules from the contract are encoded here, and each has a test:
 *  1. HTTP 200 is not approval — `error` is read before anything is rendered
 *    (docs/contracts/protocols.md:11-19).
 *  2. The audit-specific payload shape is validated before use
 *    (docs/contracts/protocols.md:21). An unrecognised body becomes a client error
 *    rather than a half-rendered screen.
 *  3. The envelope root (`decision`, `usage`, `timings`) describes the audit READ, not the
 *    audited operation, so nothing here copies it into the view. The inspected trace is
 *    `data.items[0]`.
 */
import type { AuditProjection } from "@/shared/contracts";

/** `events[]` is capped by the contract; at the cap the stage list is not the whole trace. */
export const EVENT_CAP = 200;

export type TraceReadState =
  | {
      kind: "ok";
      trace: AuditProjection;
      incomplete: boolean;
      cancelled: boolean;
      eventsCapped: boolean;
      /** The gateway's own narrowing instruction, shown verbatim when present. */
      serverMessage: string | null;
    }
  | ReadFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIntOrNull = (value: unknown) => value === null || typeof value === "number";
const isString = (value: unknown) => typeof value === "string";

export type EnvelopeError = { code: string; message: string };

/** Returns the envelope error when the body carries one, for any HTTP status. */
export function readError(body: unknown): EnvelopeError | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  if (!isString(code)) return null;
  return { code, message: isString(message) ? message : "" };
}

function isUsage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isIntOrNull(value.generation_input_tokens) &&
    isIntOrNull(value.generation_output_tokens) &&
    isIntOrNull(value.generation_ms) &&
    isIntOrNull(value.semantic_input_tokens) &&
    typeof value.semantic_ms === "number" &&
    typeof value.reserved_generation_tokens === "number" &&
    typeof value.unresolved_reservation === "boolean" &&
    isIntOrNull(value.comparison_micro_usd) &&
    isString(value.comparison_rate_version)
  );
}

function isEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.stage) &&
    isString(value.event_type) &&
    isString(value.created_at) &&
    typeof value.policy_version === "number" &&
    typeof value.feed_version === "number" &&
    Array.isArray(value.findings) &&
    isRecord(value.semantic) &&
    isUsage(value.usage)
  );
}

function isProjection(value: unknown): value is AuditProjection {
  if (!isRecord(value)) return false;
  const decisionOk = value.decision === null || isString(value.decision);
  const eventsOk = value.events === undefined || (Array.isArray(value.events) && value.events.every(isEvent));
  return (
    isString(value.trace_id) &&
    isString(value.actor_id) &&
    isString(value.operation) &&
    isString(value.created_at) &&
    decisionOk &&
    Array.isArray(value.reasons) &&
    isString(value.state) &&
    typeof value.policy_version === "number" &&
    typeof value.feed_version === "number" &&
    isUsage(value.usage) &&
    eventsOk
  );
}

/**
 * Narrows `data` to the audit payload. `null` means "this is not an audit response",
 * which is deliberately different from an empty list.
 */
export function readProjections(body: unknown): AuditProjection[] | null {
  if (!isRecord(body)) return null;
  const { data } = body;
  if (!isRecord(data) || !Array.isArray(data.items)) return null;
  if (!data.items.every(isProjection)) return null;
  return data.items as AuditProjection[];
}

/** True when the trace itself, not the read, did not finish. */
function isIncomplete(trace: AuditProjection, code: string | null): boolean {
  return code === "INCOMPLETE" || trace.state === "incomplete";
}

function isCancelled(trace: AuditProjection, code: string | null): boolean {
  return code === "CANCELLED" || trace.state === "cancelled" || trace.reasons.includes("CANCELLED");
}

/**
 * The refusal states shared by every audit read: one trace, the trace list and the metrics.
 * Kept in one place so the three screens cannot drift apart on what a given code means.
 */
export type ReadFailure = {
  kind:
    | "notFound"
    | "denied"
    | "unauthenticated"
    | "invalidInput"
    | "rateLimited"
    | "auditUnavailable"
    | "stateUnavailable"
    | "clientError";
};

/**
 * Returns the failure state, or `null` when the response may be rendered.
 *
 * The error code decides before the status, because a governed refusal can arrive with any
 * status, and HTTP 200 is not approval. `hasPayload` says whether a usable payload was found,
 * which is what separates "incomplete but showable" from "nothing trustworthy to show".
 */
export function classifyFailure(status: number, body: unknown, hasPayload: boolean): ReadFailure | null {
  const error = readError(body);

  if (error) {
    switch (error.code) {
      case "UNAUTHENTICATED":
        return { kind: "unauthenticated" };
      case "ACCESS_DENIED":
        return { kind: "denied" };
      case "NOT_FOUND":
        return { kind: "notFound" };
      case "INVALID_INPUT":
        return { kind: "invalidInput" };
      case "RATE_LIMITED":
      case "BUDGET_EXHAUSTED":
        return { kind: "rateLimited" };
      case "AUDIT_UNAVAILABLE":
        return { kind: "auditUnavailable" };
      case "STATE_UNAVAILABLE":
        return { kind: "stateUnavailable" };
      case "INCOMPLETE":
      case "CANCELLED":
        // These describe the audited operation. With a payload the screen renders it with a
        // notice; without one there is nothing trustworthy to render.
        return hasPayload ? null : { kind: "clientError" };
      default:
        // POLICY_UNAVAILABLE, SEMANTIC_UNAVAILABLE, MODEL_UNAVAILABLE and the mutation-only
        // codes are not reachable on an audit read; anything unforeseen is a client error.
        return { kind: "clientError" };
    }
  }

  if (status !== 200) return { kind: "clientError" };
  return hasPayload ? null : { kind: "clientError" };
}

/** Maps an HTTP status plus a response body to exactly one state of the trace screen. */
export function classifyTraceRead(status: number, body: unknown): TraceReadState {
  const error = readError(body);
  const projections = readProjections(body);
  const trace = projections?.[0] ?? null;

  const failure = classifyFailure(status, body, projections !== null);
  if (failure) return failure;
  // A single-trace read that returned no item is a trace this actor cannot see.
  if (trace === null) return { kind: "notFound" };

  return {
    kind: "ok",
    trace,
    incomplete: isIncomplete(trace, error?.code ?? null),
    cancelled: isCancelled(trace, error?.code ?? null),
    eventsCapped: (trace.events?.length ?? 0) >= EVENT_CAP,
    serverMessage: error?.message ? error.message : null,
  };
}
