import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, AuditProjection } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { envelope, errorOutcome } from "./envelope";
import { isUuid } from "./http";
import type { ActivityRow, GatewayDeps, Outcome } from "./ports";

/*
 * audit_list: the actor's own audited operations, newest first.
 *
 * `docs/contracts/openapi.json` gives this operation one parameter, `after`. With no scope
 * parameter the list can only mean one thing, so it is always own activity — including for an
 * admin. The organisation view gets its figures from metrics_read, which does have a scope, and an
 * admin who needs another actor's trace opens it by id, where audit_read already allows it.
 *
 * Returning organisation rows here for an admin would put other people's operations under a
 * heading that says they are the reader's own. Whether `audit_list` should gain a `scope`
 * parameter is a contract question for the integrator, who owns docs/contracts.
 *
 * No audit write and no events: protocols.md "Dashboard projections" keeps `events[]` to the single
 * trace read, and a list of rows is a projection, not a content read.
 */

/** protocols.md: one page of the audit list is at most 100 items. Not a tunable. */
export const PAGE_LIMIT = 100;

/**
 * One row to the projection the contract publishes, field by field.
 *
 * `events` is deliberately absent rather than empty: an empty array would state that the operation
 * recorded no stages, which is a claim this list never checked.
 */
export function toListProjection(row: ActivityRow): AuditProjection {
  return {
    trace_id: row.trace_id,
    actor_id: row.actor_id,
    operation: row.operation,
    created_at: row.created_at,
    decision: row.decision,
    reasons: row.reasons,
    state: row.state,
    policy_version: row.policy_version as number,
    feed_version: row.feed_version as number,
    usage: row.usage,
  };
}

/**
 * One page of the actor's own activity.
 *
 * `after` is the trace id of the last row the caller already has. It is resolved to that row's
 * position before paging, so a cursor the actor may not see reads as an invalid cursor rather than
 * confirming that the trace exists for someone else.
 */
export async function listAudit(
  deps: GatewayDeps,
  actor: ActorContext,
  after: string | null,
): Promise<Outcome> {
  if (after !== null && !isUuid(after)) return errorOutcome("INVALID_INPUT");

  const page = await deps.repository.listActivity({
    organisationId: actor.organisation_id,
    actorId: actor.actor_id,
    after,
    limit: PAGE_LIMIT,
  });
  if (page === null) return errorOutcome("INVALID_INPUT");

  // Never partial: one row that does not match the contract withholds the whole page, the same
  // rule audit_read and source_list follow.
  const items: AuditProjection[] = [];
  for (const row of page) {
    const checked = check("AuditProjection", toListProjection(row));
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }

  // The root describes this read, not the operations it lists.
  return {
    status: 200,
    body: envelope({ trace_id: randomUUID(), decision: "ALLOW", data: { items } }),
  };
}
