import "server-only";
import type { ActorContext, Review } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { sha256Hex } from "./checks";
import { envelope, errorOutcome, GatewayError, notExecutedUsage, STATUS } from "./envelope";
import type { GatewayDeps, Outcome, ReviewRow } from "./ports";

/*
 * review_list and review_read: the administrator's queue of held candidates.
 *
 * technical-spec §5 makes an administrator's read of candidate text a distinct privileged operation,
 * not a dashboard projection — the requester only ever sees status and a reason category. So both
 * operations here are admin-only and both are audited, including the list: `Review` carries
 * `candidate_text`, so listing is a disclosure of private review content exactly as reading one is.
 * The audit records the review ids and counts, never a character of the candidate.
 *
 * As everywhere else in the gateway, the audit write is the release gate: an unrecorded read
 * returns nothing.
 */

/** protocols.md: dashboard-style reads are capped at 50 items. Not a tunable. */
export const REVIEW_LIMIT = 50;

type Recorded = { trace_id: string; policy_version: number; feed_version: number };

/**
 * Record the privileged read, or answer with the reason it could not be recorded.
 *
 * A refusal the RPC itself decided is the answer to the request; anything else means the read went
 * unrecorded, so the candidate text is withheld rather than disclosed unaudited.
 */
async function record(
  deps: GatewayDeps,
  actor: ActorContext,
  operation: string,
  requestSha256: string,
  decision: "ALLOW" | "BLOCK",
  reasons: string[],
  event: Record<string, unknown> & { stage: string },
): Promise<Recorded | Outcome> {
  try {
    return await deps.repository.recordAccessDecision({
      actor,
      operation,
      // Null, not a request key: every read of a candidate is a fresh access decision.
      idempotencyKey: null,
      requestSha256,
      decision,
      reasons,
      usage: notExecutedUsage(),
      event,
    });
  } catch (error) {
    const decided = error instanceof GatewayError && STATUS[error.code] < 500;
    return errorOutcome(decided ? error.code : "AUDIT_UNAVAILABLE");
  }
}

const isOutcome = (result: Recorded | Outcome): result is Outcome => "body" in result;

/** Projected field by field: a new review column cannot reach a caller by being selected. */
const toReview = (row: ReviewRow) =>
  check("Review", {
    id: row.id,
    version: row.version,
    candidate_text: row.candidate_text,
    classification: row.classification,
    status: row.status,
    document_id: row.document_id,
  });

/** Held candidates of the actor's own organisation, pending first. Administrators only. */
export async function listReviews(deps: GatewayDeps, actor: ActorContext): Promise<Outcome> {
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");

  const rows = await deps.repository.listReviews(actor.organisation_id, REVIEW_LIMIT);
  const items: Review[] = [];
  for (const row of rows) {
    const checked = toReview(row);
    // Never partial: one unmappable row withholds the queue rather than hiding a held candidate.
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }

  const recorded = await record(deps, actor, "review_list", sha256Hex(actor.organisation_id), "ALLOW", [], {
    stage: "access",
    result_count: items.length,
    review_ids: items.map((item) => item.id),
  });
  if (isOutcome(recorded)) return recorded;

  return {
    status: 200,
    body: envelope({
      trace_id: recorded.trace_id,
      policy_version: recorded.policy_version,
      feed_version: recorded.feed_version,
      decision: "ALLOW",
      data: { items },
    }),
  };
}

/**
 * One held candidate at its current version. Administrators only.
 *
 * Another organisation's id is not found here, so it is the same 404 as an id that never existed.
 * A non-admin is refused before the read, which is why that case is 403 and carries no id either.
 */
export async function readReview(deps: GatewayDeps, actor: ActorContext, id: string): Promise<Outcome> {
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");

  const row = await deps.repository.readReview(actor.organisation_id, id);
  const checked = row ? toReview(row) : null;

  // A refused read is audited the way excerpt_read audits one, and for the same reason: the attempt
  // is what an administrator did, and the trail must not become a way to confirm an id exists.
  const recorded = row
    ? await record(deps, actor, "review_read", sha256Hex(id), "ALLOW", [], {
        stage: "access",
        // The id of a review this administrator may read; never the candidate text itself.
        review_id: id,
        version: row.version,
      })
    : await record(deps, actor, "review_read", sha256Hex(id), "BLOCK", ["review:unavailable"], {
        stage: "access",
      });
  if (isOutcome(recorded)) return recorded;
  const versions = { policy_version: recorded.policy_version, feed_version: recorded.feed_version };

  if (!checked) return errorOutcome("NOT_FOUND", { trace_id: recorded.trace_id, ...versions });
  if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE", { trace_id: recorded.trace_id, ...versions });
  return {
    status: 200,
    body: envelope({ trace_id: recorded.trace_id, ...versions, decision: "ALLOW", data: checked.value }),
  };
}
