import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, ImportSummary, SourceSummary } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { envelope, errorOutcome } from "./envelope";
import { isUuid } from "./http";
import type { GatewayDeps, Outcome } from "./ports";

/*
 * source_list: the metadata the workbench needs to offer a source, and nothing else.
 *
 * protocols.md "Dashboard projections": fixed maximum 50 items, actor/deal filtering before
 * serialization. The filtering itself runs in the query (the gateway repository uses the privileged
 * client, which bypasses RLS), so this module decides *what* a role may see and the repository
 * applies it. No audit write: this is a metadata list, like a poll, not a content read.
 */

/** protocols.md: source and import lists are capped at 50 items. Not a tunable. */
export const LIST_LIMIT = 50;

type Classification = SourceSummary["classification"];
const EVERY: readonly Classification[] = ["public", "internal", "restricted"];

/**
 * Which sources a role may see listed, from requirements.md §2.
 *
 * `classifications` is visible regardless of deal; `dealIds` additionally exposes restricted sources
 * of those deals. An admin sees the whole organisation, which is `EVERY` because the column is an
 * enum of exactly these three values — no separate unfiltered branch to get wrong.
 *
 * This lists labels, not content: an admin seeing a restricted source exists is not the same as
 * reading its excerpts, which stays deal-scoped in retrieval.
 */
export function sourceScope(actor: ActorContext): {
  classifications: readonly Classification[];
  dealIds: readonly string[];
} {
  if (actor.role === "admin") return { classifications: EVERY, dealIds: [] };
  const classifications: readonly Classification[] =
    actor.role === "external" ? ["public"] : ["public", "internal"];
  // Trusted server records, but they are interpolated into a filter: anything not a UUID is dropped.
  const dealIds = actor.role === "analyst" ? actor.deal_ids.filter(isUuid) : [];
  return { classifications, dealIds };
}

/** Sources this actor may see, newest first. Never partial: one unmappable row withholds the list. */
export async function listSources(deps: GatewayDeps, actor: ActorContext): Promise<Outcome> {
  const rows = await deps.repository.listSources(actor, LIST_LIMIT);
  const items: SourceSummary[] = [];
  for (const row of rows) {
    // Projected field by field: a new column cannot leak into the response by being selected.
    const checked = check("SourceSummary", {
      id: row.id,
      label: row.label,
      classification: row.classification,
      kind: row.kind,
    });
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }
  return {
    status: 200,
    body: envelope({ trace_id: randomUUID(), decision: "ALLOW", data: { items } }),
  };
}

/*
 * import_list: which imports an actor may follow, not what they contain.
 *
 * requirements.md §2: an administrator oversees the organisation's imports; everyone else follows
 * their own. Same 50-item cap and same projection discipline as source_list, and no audit write —
 * status of your own upload is metadata, not protected content.
 */

/** null = the whole organisation; otherwise only this actor's own uploads. */
export function importScope(actor: ActorContext): { uploadedBy: string | null } {
  return { uploadedBy: actor.role === "admin" ? null : actor.actor_id };
}

/** Imports this actor may see, newest first. Never partial: one unmappable row withholds the list. */
export async function listImports(deps: GatewayDeps, actor: ActorContext): Promise<Outcome> {
  const rows = await deps.repository.listImports(actor, LIST_LIMIT);
  const items: ImportSummary[] = [];
  for (const row of rows) {
    // ImportSummary requires a run: a document still waiting for its import run to settle has no
    // outcome to report, and skipping it here keeps one such row from withholding the whole list.
    if (!row.run_id) continue;
    const checked = check("ImportSummary", {
      id: row.id,
      run_id: row.run_id,
      status: row.status,
      classification: row.classification,
    });
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }
  return {
    status: 200,
    body: envelope({ trace_id: randomUUID(), decision: "ALLOW", data: { items } }),
  };
}
