import "server-only";
import type { ActorContext, AuditProjection, Usage } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { GatewayError, SEMANTIC_NOT_REQUIRED, envelope, errorOutcome, notExecutedUsage } from "./envelope";
import type { ActivityRow, EventRow, GatewayDeps, Outcome } from "./ports";

const EVENT_CAP = 200;

type Unit = { unit: string; amount?: number; reserved?: number; actual?: number | null; state?: string };
type Event = NonNullable<AuditProjection["events"]>[number];

const invalid = (): never => {
  throw new GatewayError("STATE_UNAVAILABLE");
};
const providerOf = (payload: Record<string, unknown>) =>
  typeof payload.provider === "string" ? payload.provider : invalid();
const units = (value: unknown): Unit[] => (Array.isArray(value) ? value : invalid());

/** Absent unit = that call never used it (0); present with an unknown actual = null. */
function completionUsage(rate: string, usage: Unit[]): Usage {
  const find = (unit: string) => usage.find((u) => u.unit === unit);
  const generated = find("generation_tokens") !== undefined;
  const semantic = find("semantic_tokens");
  const ms = find("generation_ms");
  return {
    ...notExecutedUsage(rate),
    // README Q9: a generation completion only knows the settled total, so the split stays null here.
    generation_input_tokens: generated ? null : 0,
    generation_output_tokens: generated ? null : 0,
    generation_ms: ms ? (ms.actual ?? null) : 0,
    semantic_input_tokens: semantic ? (semantic.actual ?? null) : 0,
    reserved_generation_tokens: find("generation_tokens")?.reserved ?? 0,
    unresolved_reservation: usage.some((u) => u.state === "unresolved"),
    comparison_micro_usd: generated ? null : 0,
  };
}

/**
 * Copies only mapped, safe fields: never request hashes, call ids, limits, prompts or answers.
 * Throws STATE_UNAVAILABLE when a row cannot be mapped; the caller still schema-checks the result.
 */
export function toAuditProjection(activity: ActivityRow, events: EventRow[]): AuditProjection {
  const rate = activity.usage?.comparison_rate_version ?? "none";
  const providers = new Map<unknown, string>(
    events
      .filter((e) => e.event_type === "provider_started")
      .map((e) => [e.payload.call_id, providerOf(e.payload)]),
  );
  const toEvent = ({ event_type, payload, created_at }: EventRow): Event => {
    const base = {
      event_type,
      created_at,
      // ponytail: per-suboperation versions once T07 can change the head mid-trace
      policy_version: activity.policy_version as number,
      feed_version: activity.feed_version as number,
      findings: [],
      semantic: SEMANTIC_NOT_REQUIRED,
    };
    switch (event_type) {
      case "intent":
        return { ...base, stage: payload.operation as string, usage: notExecutedUsage(rate) };
      case "provider_started":
        return {
          ...base,
          stage: `${providerOf(payload)}:reserved`,
          usage: {
            ...notExecutedUsage(rate),
            reserved_generation_tokens:
              units(payload.units).find((u) => u.unit === "generation_tokens")?.amount ?? 0,
          },
        };
      case "completion":
        return {
          ...base,
          stage: `${providers.get(payload.call_id) ?? invalid()}:settled`,
          usage: completionUsage(rate, units(payload.usage)),
        };
      case "decision":
      case "incomplete":
        return {
          ...base,
          stage: payload.stage as string,
          findings: payload.findings as Event["findings"],
          semantic: payload.semantic as Event["semantic"],
          usage: payload.usage as Usage,
        };
      default:
        return invalid();
    }
  };
  return {
    trace_id: activity.trace_id,
    actor_id: activity.actor_id,
    operation: activity.operation,
    created_at: activity.created_at,
    decision: activity.decision,
    reasons: activity.reasons,
    state: activity.state,
    policy_version: activity.policy_version as number,
    feed_version: activity.feed_version as number,
    usage: activity.usage,
    events: events.map(toEvent),
  };
}

/** Owner or same-organisation admin; anything else is the same 404. Reads are not audited (README Q5). */
export async function readAudit(deps: GatewayDeps, actor: ActorContext, traceId: string): Promise<Outcome> {
  const trace = await deps.repository.readTrace(actor, traceId);
  if (!trace) return errorOutcome("NOT_FOUND");
  if (trace.events.length > EVENT_CAP) {
    return errorOutcome("INCOMPLETE", {
      status: 413,
      message: "This trace has more than 200 events; narrow the request.",
    });
  }
  // Never a partial trace: anything that does not map or validate withholds the whole projection.
  let projection: AuditProjection;
  try {
    projection = toAuditProjection(trace.activity, trace.events);
  } catch {
    return errorOutcome("STATE_UNAVAILABLE");
  }
  if (!check("AuditProjection", projection).ok) return errorOutcome("STATE_UNAVAILABLE");
  // The root describes this read, not the inspected operation (that is data.items[0]).
  return {
    status: 200,
    body: envelope({ trace_id: crypto.randomUUID(), decision: "ALLOW", data: { items: [projection] } }),
  };
}
