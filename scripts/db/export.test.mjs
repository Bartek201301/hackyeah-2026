// test:db — finalize_export against the shared project (post-G2 phase 12, migration K). Manual, never CI.
// Its only writes: reviewer export runs labelled db_test_run/db_test_execute with their audit events and
// actor_activity rows (operation db_test), and one exports row per green run that expires after a minute and
// has no Storage object (a download of it is a 404 once expired). Requires the P05 corpus (one approved
// public and one approved internal excerpt). No reservations, no Storage objects, no deletes.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anon, fixtures, must } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const db = admin();
let reviewer;
let pub;
let internal;

before(async () => {
  const { email } = fixtures.accounts.find((account) => account.alias === "reviewer");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  reviewer = users.find((user) => user.email === email).id;
  const approved = (classification) =>
    db
      .from("excerpts")
      .select("id, version")
      .eq("organisation_id", ORG)
      .eq("status", "approved")
      .eq("classification", classification)
      .limit(1)
      .maybeSingle();
  pub = must("public excerpt", await approved("public"));
  internal = must("internal excerpt", await approved("internal"));
  assert.ok(pub && internal, "Corpus missing: run the P05 import first.");
});

const rpc = async (name, args) => must(name, await db.rpc(name, args));
const rpcError = async (name, args) => (await db.rpc(name, args)).error?.message;

/** A started export run claimed with a lease, plus its execute operation, as run_execute does it. */
async function claimedExport() {
  const run = await rpc("start_run", {
    p_organisation_id: ORG,
    p_actor_id: reviewer,
    p_operation: "db_test_run",
    p_kind: "export",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: randomUUID(),
    p_input_private: { topic: "db_test", deal_id: null },
  });
  const lease = randomUUID();
  must(
    "claim",
    await db
      .from("runs")
      .update({
        state: "running",
        stage: "checking",
        lease_token: lease,
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq("id", run.run_id)
      .eq("state", "pending")
      .select("id")
      .single(),
  );
  const op = await rpc("begin_operation", {
    p_organisation_id: ORG,
    p_actor_id: reviewer,
    p_operation: "db_test_execute",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: run.run_id,
    p_run_id: run.run_id,
  });
  return { p_run_id: run.run_id, p_lease_token: lease, p_operation_id: op.operation_id };
}

function exportArgs(cited, id = randomUUID()) {
  const expires = new Date(Date.now() + 60_000).toISOString();
  return {
    p_outcome: {
      run_state: "completed",
      operation_state: "completed",
      decision: "ALLOW",
      reasons: [],
      usage: { semantic_ms: 0, unresolved_reservation: false },
      operation: "db_test",
      stage: "done",
      result: {
        status: 200,
        decision: "ALLOW",
        data: { download_path: `/api/v1/exports/${id}/download`, expires_at: expires },
      },
      event: { stage: "done" },
    },
    p_export: {
      id,
      storage_key: `${ORG}/${id}.pdf`,
      text_sha256: "0".repeat(64),
      expires_at: expires,
      excerpt_versions: [{ excerpt_id: cited.id, version: cited.version }],
    },
  };
}

const exportsOf = async (runId) =>
  must("read exports", await db.from("exports").select("id, actor_id, status").eq("run_id", runId));
const runState = async (runId) =>
  must("read run", await db.from("runs").select("state").eq("id", runId).single()).state;

test("finalize_export inserts the export once and settles the run; a replay conflicts", async () => {
  const run = await claimedExport();
  const id = randomUUID();
  const result = await rpc("finalize_export", { ...run, ...exportArgs(pub, id) });
  assert.deepEqual(result, { finalized: true, state: "completed", export_id: id });
  assert.deepEqual(await exportsOf(run.p_run_id), [{ id, actor_id: reviewer, status: "ready" }]);
  assert.equal(await runState(run.p_run_id), "completed");

  assert.equal(await rpcError("finalize_export", { ...run, ...exportArgs(pub) }), "CONFLICT");
  assert.equal((await exportsOf(run.p_run_id)).length, 1);
});

test("an internal excerpt cannot be cited by an export: CONFLICT, nothing inserted", async () => {
  const run = await claimedExport();
  const args = exportArgs(internal);
  assert.equal(await rpcError("finalize_export", { ...run, ...args }), "CONFLICT");
  assert.equal((await exportsOf(run.p_run_id)).length, 0);
  assert.equal(await runState(run.p_run_id), "running");
  // Settle the test run so it does not linger as running.
  await rpc("finalize_run", {
    ...run,
    p_outcome: { ...args.p_outcome, run_state: "failed", decision: null, result: null },
  });
});

test("anon cannot execute finalize_export", async () => {
  const { error } = await anon().rpc("finalize_export", {
    p_run_id: randomUUID(),
    p_lease_token: randomUUID(),
    p_operation_id: randomUUID(),
    p_outcome: {},
    p_export: {},
  });
  assert.ok(error, "anon call must fail");
});
