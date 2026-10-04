import "server-only";
import type { ActorContext, Client, ClientCreate, ClientUpdate, Finding } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { loadControls } from "./calls";
import { decide, matchSensitive, matchSignatures, sha256Hex } from "./checks";
import {
  canList,
  createVerdict,
  deleteVerdict,
  editVerdict,
  visibleClient,
  type ActionVerdict,
} from "./client-rules";
import { envelope, errorOutcome, GatewayError, notExecutedUsage, STATUS } from "./envelope";
import { isUuid } from "./http";
import type { GatewayDeps, Outcome } from "./ports";

/*
 * client_list, client_create, client_update, client_delete: the reference app's client actions.
 *
 * client-rules.ts decides who may do what; this module enforces it. Free text runs through the same
 * deterministic feed-signature and secret/contact checks as an import, and any hit blocks the write.
 * Only an ALLOW reaches create_client/update_client, which write and audit in one transaction. A
 * BLOCK or REVIEW writes nothing and is recorded here. Delete has no write path at all: an admin's
 * delete is held for approval and everyone else's is refused.
 *
 * Audit payloads carry ids, field names and the role tier only, never a name, note or amount.
 */

/** protocols.md: dashboard-style reads are capped at 50 items. Not a tunable. */
export const CLIENT_LIMIT = 50;
const STAGE = "client_action";
const SIGNATURE_STAGE = "client_signature";

type Recorded = { trace_id: string; policy_version: number; feed_version: number };
type Event = Record<string, unknown>;
type Versions = Pick<Recorded, "policy_version" | "feed_version">;

/** A decision the caller is answered with; an unrecorded one withholds the answer (release gate). */
async function record(
  deps: GatewayDeps,
  actor: ActorContext,
  operation: string,
  idempotencyKey: string | null,
  requestSha256: string,
  decision: "ALLOW" | "BLOCK",
  reasons: string[],
  event: Event,
): Promise<Recorded | Outcome> {
  try {
    return await deps.repository.recordAccessDecision({
      actor,
      operation,
      idempotencyKey,
      requestSha256,
      decision,
      reasons,
      usage: notExecutedUsage(),
      event: { ...event, stage: STAGE },
    });
  } catch (error) {
    const decided = error instanceof GatewayError && STATUS[error.code] < 500;
    return errorOutcome(decided ? error.code : "AUDIT_UNAVAILABLE");
  }
}

const isOutcome = (result: Recorded | Outcome): result is Outcome => "body" in result;
const versions = (r: Recorded): Versions => ({
  policy_version: r.policy_version,
  feed_version: r.feed_version,
});

/**
 * BLOCK → 403; REVIEW → 200 with the hold and no data. Nothing was written either way.
 * ponytail: record_access_decision takes ALLOW|BLOCK only, so a held action is audited as the denied
 * operation it is, flagged `held`; record REVIEW itself once that RPC accepts it.
 */
async function refuse(
  deps: GatewayDeps,
  actor: ActorContext,
  operation: string,
  key: string,
  requestSha256: string,
  verdict: ActionVerdict,
  event: Event,
): Promise<Outcome> {
  const held = verdict.decision === "REVIEW";
  const recorded = await record(deps, actor, operation, key, requestSha256, "BLOCK", verdict.reasons, {
    ...event,
    held,
  });
  if (isOutcome(recorded)) return recorded;
  const fields = { trace_id: recorded.trace_id, ...versions(recorded), reasons: verdict.reasons };
  return held
    ? { status: 200, body: envelope({ ...fields, decision: "REVIEW" }) }
    : errorOutcome("ACCESS_DENIED", fields);
}

/** Unknown, foreign, malformed, or not listable: one audited 404 that never confirms an id exists. */
async function notFound(
  deps: GatewayDeps,
  actor: ActorContext,
  operation: string,
  key: string,
  requestSha256: string,
): Promise<Outcome> {
  const recorded = await record(
    deps,
    actor,
    operation,
    key,
    requestSha256,
    "BLOCK",
    ["client:unavailable"],
    {},
  );
  if (isOutcome(recorded)) return recorded;
  return errorOutcome("NOT_FOUND", { trace_id: recorded.trace_id, ...versions(recorded) });
}

/** The client of the actor's organisation, or null; a role that cannot list cannot probe ids either. */
const readVisible = (deps: GatewayDeps, actor: ActorContext, id: string) =>
  isUuid(id) && canList(actor.role) ? deps.repository.readClient(actor.organisation_id, id) : null;

/**
 * Import's deterministic checks over each free-text field. Any finding blocks, whatever its feed
 * action: a client record is not a held candidate. null = the controls are unavailable.
 */
async function textVerdict(
  deps: GatewayDeps,
  actor: ActorContext,
  fields: Record<string, string | undefined>,
): Promise<{ verdict: ActionVerdict; findings: Finding[]; versions: Versions } | null> {
  const controls = await loadControls(deps, actor);
  if (!controls) return null;
  const findings = Object.entries(fields).flatMap(([field, text]) =>
    text
      ? [
          ...matchSignatures(text, controls.feed, SIGNATURE_STAGE),
          ...matchSensitive(text, SIGNATURE_STAGE),
        ].map((f) => ({ ...f, locator: field }))
      : [],
  );
  const { reasons } = decide(findings, null, controls.policy);
  return {
    verdict: findings.length ? { decision: "BLOCK", reasons } : { decision: "ALLOW", reasons: [] },
    findings,
    versions: controls.versions,
  };
}

/** Clients of the organisation; fee, version and notes for editors only. Not available to externals. */
export async function listClients(deps: GatewayDeps, actor: ActorContext): Promise<Outcome> {
  if (!canList(actor.role)) return errorOutcome("NOT_FOUND");

  const rows = await deps.repository.listClients(actor.organisation_id, CLIENT_LIMIT);
  const items: Client[] = [];
  for (const row of rows) {
    // Projected by role, then checked: a column the contract does not name withholds the list.
    const checked = check("Client", visibleClient(actor.role, row));
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }

  const recorded = await record(
    deps,
    actor,
    "client_list",
    null,
    sha256Hex(actor.organisation_id),
    "ALLOW",
    [],
    {
      result_count: items.length,
      limit_tier: actor.role,
    },
  );
  if (isOutcome(recorded)) return recorded;
  return {
    status: 200,
    body: envelope({
      trace_id: recorded.trace_id,
      ...versions(recorded),
      decision: "ALLOW",
      data: { items },
    }),
  };
}

export async function createClient(
  deps: GatewayDeps,
  actor: ActorContext,
  body: ClientCreate,
  key: string,
): Promise<Outcome> {
  const operation = "client_create";
  const client: ClientCreate = {
    name: body.name,
    sector: body.sector,
    notes: body.notes,
    annual_fee_usd: body.annual_fee_usd,
    status: body.status,
  };
  // Fixed key order, absent fields omitted: the same request always hashes the same.
  const sha = sha256Hex(JSON.stringify(client));
  const fields = Object.keys(body).sort();

  const role = createVerdict(actor.role);
  if (role.decision !== "ALLOW") return refuse(deps, actor, operation, key, sha, role, { fields });

  const text = await textVerdict(deps, actor, {
    name: client.name,
    sector: client.sector,
    notes: client.notes,
  });
  if (!text) return errorOutcome("POLICY_UNAVAILABLE");
  if (text.verdict.decision !== "ALLOW") {
    return refuse(deps, actor, operation, key, sha, text.verdict, { fields, findings: text.findings });
  }

  const written = await deps.repository.createClient({
    actor,
    idempotencyKey: key,
    requestSha256: sha,
    client,
  });
  return {
    status: 201,
    body: envelope({
      // create_client records its own ALLOW audit and returns no trace, so this one is ephemeral.
      trace_id: crypto.randomUUID(),
      ...text.versions,
      decision: "ALLOW",
      data: { client_id: written.client_id, version: written.version },
    }),
  };
}

export async function updateClient(
  deps: GatewayDeps,
  actor: ActorContext,
  id: string,
  body: ClientUpdate,
  key: string,
): Promise<Outcome> {
  const operation = "client_update";
  const { sector, notes, annual_fee_usd, status } = body.changes;
  const changes: ClientUpdate["changes"] = { sector, notes, annual_fee_usd, status };
  const sha = sha256Hex(JSON.stringify({ client_id: id, expected_version: body.expected_version, changes }));

  const current = await readVisible(deps, actor, id);
  if (!current) return notFound(deps, actor, operation, key, sha);

  const event = { client_id: id, fields: Object.keys(body.changes).sort(), limit_tier: actor.role };
  const edit = editVerdict(actor.role, current, changes);
  if (edit.decision === "BLOCK") return refuse(deps, actor, operation, key, sha, edit, event);

  // Checked even when the edit is held: content that would be blocked is never queued for approval.
  const text = await textVerdict(deps, actor, { sector, notes });
  if (!text) return errorOutcome("POLICY_UNAVAILABLE");
  if (text.verdict.decision !== "ALLOW") {
    return refuse(deps, actor, operation, key, sha, text.verdict, { ...event, findings: text.findings });
  }
  if (edit.decision !== "ALLOW") return refuse(deps, actor, operation, key, sha, edit, event);

  // A stale expected_version throws CONFLICT (409) from the RPC; nothing is written.
  const written = await deps.repository.updateClient({
    actor,
    idempotencyKey: key,
    requestSha256: sha,
    clientId: id,
    expectedVersion: body.expected_version,
    changes,
  });
  return {
    status: 200,
    body: envelope({
      trace_id: crypto.randomUUID(),
      ...text.versions,
      decision: "ALLOW",
      data: { client_id: written.client_id, version: written.version },
    }),
  };
}

/** Never deletes: an admin's request is held for approval, anyone else's is refused. */
export async function deleteClient(
  deps: GatewayDeps,
  actor: ActorContext,
  id: string,
  key: string,
): Promise<Outcome> {
  const operation = "client_delete";
  const sha = sha256Hex(JSON.stringify({ client_id: id }));
  const current = await readVisible(deps, actor, id);
  if (!current) return notFound(deps, actor, operation, key, sha);
  return refuse(deps, actor, operation, key, sha, deleteVerdict(actor.role), {
    client_id: id,
    limit_tier: actor.role,
  });
}
