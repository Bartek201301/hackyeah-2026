import "server-only";
import type { ActorContext, Excerpt, SearchRequest } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { loadControls } from "./calls";
import { sha256Hex } from "./checks";
import { envelope, errorOutcome, GatewayError, notExecutedUsage, STATUS } from "./envelope";
import type { GatewayDeps, Outcome, PermittedExcerpt } from "./ports";
import { toCitation } from "./retrieval";

/*
 * excerpt_search and excerpt_read: the only operations that hand approved text to a caller directly.
 *
 * Both are audited access decisions, not dashboard projections. protocols.md: "GET retrieval still
 * creates a fresh audited access decision", so the read records every time and never caches one.
 * The permission filter itself is in SQL (search_permitted_excerpts / read_permitted_excerpts,
 * migration F): this module passes the actor and an audience, never a role or a deal list, so the
 * scope cannot be widened from here.
 *
 * What the audit must never hold: the question or any excerpt text. The event carries the query
 * hash, counts and — only for an access that was granted — the excerpt id.
 */

type Recorded = { trace_id: string; policy_version: number; feed_version: number };

/**
 * Write the access decision, which is the release gate: nothing is disclosed unless it committed.
 *
 * A refusal the RPC itself decided (a replayed Idempotency-Key with a different body is CONFLICT) is
 * the answer to the request. Anything else means the access went unrecorded, so the result is
 * withheld rather than returned unaudited.
 */
async function record(
  deps: GatewayDeps,
  input: Parameters<GatewayDeps["repository"]["recordAccessDecision"]>[0],
): Promise<Recorded | Outcome> {
  try {
    return await deps.repository.recordAccessDecision(input);
  } catch (error) {
    const decided = error instanceof GatewayError && STATUS[error.code] < 500;
    return errorOutcome(decided ? error.code : "AUDIT_UNAVAILABLE");
  }
}

const isOutcome = (result: Recorded | Outcome): result is Outcome => "body" in result;

/** Projected field by field, so a new excerpt column cannot reach a caller by being selected. */
const toExcerpt = (row: PermittedExcerpt) =>
  check("Excerpt", {
    id: row.id,
    version: row.version,
    text: row.text,
    classification: row.classification,
    citation: toCitation(row),
  });

/**
 * Role-filtered search over approved excerpts.
 *
 * `deal_id` narrows and never grants: an actor who is not a member of it gets the same 404 as a deal
 * that does not exist (the SQL raises NOT_FOUND for the same case; checking the trusted membership
 * here keeps the refusal from costing a query).
 */
export async function searchExcerpts(
  deps: GatewayDeps,
  actor: ActorContext,
  body: SearchRequest,
  idempotencyKey: string,
): Promise<Outcome> {
  const dealId = body.deal_id ?? null;
  if (dealId !== null && !actor.deal_ids.includes(dealId)) return errorOutcome("NOT_FOUND");
  const controls = await loadControls(deps, actor);
  if (!controls) return errorOutcome("POLICY_UNAVAILABLE");

  const rows = await deps.repository.searchPermittedExcerpts(actor, {
    query: body.query,
    dealId,
    audience: "actor",
    limit: controls.policy.execution.max_search_results,
  });
  const items: Excerpt[] = [];
  for (const row of rows) {
    const checked = toExcerpt(row);
    // Never partial: one unmappable row withholds the whole result, as the list reads do.
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }

  const recorded = await record(deps, {
    actor,
    operation: "excerpt_search",
    idempotencyKey,
    requestSha256: sha256Hex(JSON.stringify({ query: body.query, deal_id: dealId })),
    decision: "ALLOW",
    reasons: [],
    usage: notExecutedUsage(controls.policy.comparison_rate.version),
    // The query is recorded as a hash: an audit reader can correlate two searches without reading one.
    event: { stage: "retrieval", query_sha256: sha256Hex(body.query), result_count: items.length },
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
 * Read one approved excerpt, audited on every call.
 *
 * Missing and not permitted are the same 404: `readPermittedExcerpts` returns only permitted ids, so
 * this function cannot tell the two apart either, and the refusal body is identical. The policy head
 * is still required — `record_access_decision` takes its versions from it — so an unavailable policy
 * withholds the excerpt instead of releasing it unaudited.
 */
export async function readExcerpt(deps: GatewayDeps, actor: ActorContext, id: string): Promise<Outcome> {
  const [row] = await deps.repository.readPermittedExcerpts(actor, "actor", [id]);
  const checked = row ? toExcerpt(row) : null;

  const recorded = await record(deps, {
    actor,
    operation: "excerpt_read",
    // Null, not the request's key: protocols.md makes every GET retrieval a fresh access decision.
    idempotencyKey: null,
    requestSha256: sha256Hex(id),
    decision: checked?.ok ? "ALLOW" : "BLOCK",
    reasons: checked?.ok ? [] : ["excerpt:unavailable"],
    usage: notExecutedUsage(),
    // A denied read carries no id: the audit trail must not become a way to confirm one exists.
    event: checked?.ok ? { stage: "access", excerpt_id: id } : { stage: "access" },
  });
  if (isOutcome(recorded)) return recorded;
  const versions = { policy_version: recorded.policy_version, feed_version: recorded.feed_version };

  if (!checked) return errorOutcome("NOT_FOUND", { trace_id: recorded.trace_id, ...versions });
  // A row that does not match the contract is a gateway state problem, not a missing excerpt.
  if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE", { trace_id: recorded.trace_id, ...versions });
  return {
    status: 200,
    body: envelope({
      trace_id: recorded.trace_id,
      ...versions,
      decision: "ALLOW",
      data: checked.value,
    }),
  };
}
