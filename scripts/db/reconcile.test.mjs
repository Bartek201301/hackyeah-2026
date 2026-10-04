// test:db — cancel_run and reconcile_reservation against the shared project (T03 P7 migration G).
// Manual, never CI. Its only writes: reviewer runs and operations labelled db_test/db_test_execute, their
// audit events and actor_activity rows with operation db_test (kept off the demo dashboards), and
// reservations in 2000-01-02 buckets, so today's demo budgets are untouched. Every value is synthetic.
// No cleanup deletes (audit is append-only).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, fixtures, must } from "./clients.mjs";

const ORG = fixtures.organisation.id;
// Its own day, so no other test:db file moves these buckets while this one measures them.
const PERIOD = "2000-01-02";
const db = admin();
const ids = {};

before(async () => {
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  for (const alias of ["reviewer", "admin"]) {
    const { email } = fixtures.accounts.find((account) => account.alias === alias);
    ids[alias] = users.find((user) => user.email === email).id;
  }
});

const rpc = async (name, args) => must(name, await db.rpc(name, args));
const RESULT = {
  status: 409,
  decision: null,
  reasons: [],
  semantic: { status: "not_required" },
  usage: { semantic_ms: 0, unresolved_reservation: false },
  data: null,
  error: { code: "CANCELLED", message: "This run was cancelled.", retryable: false },
};
const cancelArgs = (runId, overrides = {}) => ({
  p_organisation_id: ORG,
  p_actor_id: ids.reviewer,
  p_run_id: runId,
  p_idempotency_key: randomUUID(),
  p_request_sha256: `sha:${runId}`,
  p_result: RESULT,
  ...overrides,
});
const startRun = () =>
  rpc("start_run", {
    p_organisation_id: ORG,
    p_actor_id: ids.reviewer,
    p_operation: "db_test",
    p_kind: "chat",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: randomUUID(),
    p_input_private: { message: "synthetic db_test input" },
  });
const runRow = async (id) =>
  must("run", await db.from("runs").select("state, stage, result_private").eq("id", id).single());
const cancelOps = async (runId) =>
  must(
    "cancel operations",
    await db.from("operations").select("id, state").eq("run_id", runId).eq("operation", "run_cancel"),
  );

test("cancel_run cancels a pending run with its stored result, events and activity row, once", async () => {
  const run = await startRun();
  const args = cancelArgs(run.run_id);
  const first = await rpc("cancel_run", args);
  assert.deepEqual(
    [first.state, first.stage, first.accepted, first.replay],
    ["cancelled", "cancelled", true, false],
  );
  assert.deepEqual(await runRow(run.run_id), {
    state: "cancelled",
    stage: "cancelled",
    result_private: RESULT,
  });
  const ops = await cancelOps(run.run_id);
  assert.deepEqual(
    ops.map((op) => op.state),
    ["completed"],
  );
  const events = must(
    "events",
    await db
      .from("audit_events")
      .select("event_type, payload")
      .eq("operation_id", ops[0].id)
      .order("created_at"),
  );
  assert.deepEqual(
    events.map((e) => [e.event_type, e.payload.operation ?? e.payload.stage]),
    [
      ["intent", "run_cancel"],
      ["decision", "cancelled"],
    ],
  );
  const activity = must(
    "activity",
    await db
      .from("actor_activity")
      .select("operation, state, decision, reasons, usage")
      .eq("trace_id", run.run_id),
  );
  assert.deepEqual(activity, [
    { operation: "db_test", state: "cancelled", decision: null, reasons: [], usage: RESULT.usage },
  ]);

  // Same key: one operation, the current state, accepted. Another request under it conflicts.
  const replay = await rpc("cancel_run", args);
  assert.deepEqual([replay.state, replay.accepted, replay.replay], ["cancelled", true, true]);
  assert.equal((await cancelOps(run.run_id)).length, 1);
  assert.equal(
    (await db.rpc("cancel_run", { ...args, p_request_sha256: "other" })).error?.message,
    "CONFLICT",
  );
  // A terminal run is returned unchanged and nothing is recorded.
  const terminal = await rpc("cancel_run", cancelArgs(run.run_id));
  assert.deepEqual([terminal.state, terminal.accepted], ["cancelled", false]);
  assert.equal((await cancelOps(run.run_id)).length, 1);
});

test("cancel_run requests cancellation of a running run, which finalize_run then settles", async () => {
  const run = await startRun();
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
  const exec = await rpc("begin_operation", {
    p_organisation_id: ORG,
    p_actor_id: ids.reviewer,
    p_operation: "db_test_execute",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: run.run_id,
    p_run_id: run.run_id,
  });
  const requested = await rpc("cancel_run", cancelArgs(run.run_id));
  assert.deepEqual(
    [requested.state, requested.stage, requested.accepted],
    ["cancel_requested", "checking", true],
  );
  const finalized = await rpc("finalize_run", {
    p_run_id: run.run_id,
    p_lease_token: lease,
    p_operation_id: exec.operation_id,
    p_outcome: {
      run_state: "cancelled",
      operation_state: "completed",
      decision: null,
      reasons: [],
      usage: { semantic_ms: 0, unresolved_reservation: false },
      operation: "db_test",
      stage: "input_semantic",
      result: RESULT,
      event: { stage: "input_semantic" },
    },
  });
  assert.deepEqual(finalized, { finalized: true, state: "cancelled" });
  assert.equal((await runRow(run.run_id)).state, "cancelled");
});

test("cancel_run answers NOT_FOUND for another actor's run, an admin included", async () => {
  const run = await startRun();
  const { error } = await db.rpc("cancel_run", cancelArgs(run.run_id, { p_actor_id: ids.admin }));
  assert.equal(error?.message, "NOT_FOUND");
  assert.equal((await runRow(run.run_id)).state, "pending");
  assert.equal((await cancelOps(run.run_id)).length, 0);
});

// ---- reconcile_reservation

const UNITS = [
  { unit: "generation_tokens", amount: 100, actor_limit: 1e15, org_limit: 1e15 },
  { unit: "generation_ms", amount: 50, actor_limit: 1e15, org_limit: 1e15 },
];
async function reservedCall() {
  const op = await rpc("begin_operation", {
    p_organisation_id: ORG,
    p_actor_id: ids.reviewer,
    p_operation: "db_test",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: randomUUID(),
  });
  const callId = randomUUID();
  await rpc("reserve_call", {
    p_operation_id: op.operation_id,
    p_call_id: callId,
    p_provider: "db_test",
    p_period_start: PERIOD,
    p_units: UNITS,
  });
  return callId;
}
const reconcile = (callId, actorId = ids.admin) =>
  db.rpc("reconcile_reservation", {
    p_organisation_id: ORG,
    p_admin_actor_id: actorId,
    p_call_id: callId,
    p_reason: "db_test conservative charge of an unknown call",
  });
const reservations = async (callId) =>
  must(
    "reservations",
    await db
      .from("reservations")
      .select("bucket_id, unit, amount, state, actual")
      .eq("call_id", callId)
      .order("unit")
      .order("bucket_id"),
  );
const buckets = async (bucketIds) =>
  Object.fromEntries(
    must("buckets", await db.from("budget_buckets").select("id, spent, reserved").in("id", bucketIds)).map(
      (b) => [b.id, b],
    ),
  );

test("reconcile_reservation refuses a non-admin", async () => {
  const callId = await reservedCall();
  await rpc("finish_call", { p_call_id: callId, p_actuals: [{ unit: "generation_tokens", actual: null }] });
  assert.equal((await reconcile(callId, ids.reviewer)).error?.message, "ACCESS_DENIED");
  assert.ok((await reservations(callId)).every((r) => r.state === "unresolved"));
  // The admin charges it, so this test leaves nothing outstanding in today's metrics.
  assert.deepEqual(must("reconcile", await reconcile(callId)), { charged: 4 });
});

test("reconcile_reservation charges only the unresolved rows, conservatively and once", async () => {
  const callId = await reservedCall();
  // Tokens unknown, milliseconds measured: two unresolved rows (actor + org), two settled rows.
  await rpc("finish_call", {
    p_call_id: callId,
    p_actuals: [
      { unit: "generation_tokens", actual: null },
      { unit: "generation_ms", actual: 7 },
    ],
  });
  const rows = await reservations(callId);
  const beforeBuckets = await buckets(rows.map((r) => r.bucket_id));

  assert.deepEqual(must("reconcile", await reconcile(callId)), { charged: 2 });

  const after = await reservations(callId);
  const afterBuckets = await buckets(rows.map((r) => r.bucket_id));
  for (const row of after) {
    const b0 = beforeBuckets[row.bucket_id];
    const b1 = afterBuckets[row.bucket_id];
    if (row.unit === "generation_tokens") {
      assert.deepEqual([row.state, row.actual], ["charged", null]);
      assert.deepEqual([b1.spent - b0.spent, b0.reserved - b1.reserved], [row.amount, row.amount]);
    } else {
      assert.deepEqual([row.state, row.actual], ["settled", 7]);
      assert.deepEqual([b1.spent, b1.reserved], [b0.spent, b0.reserved]);
    }
  }
  const [event] = must(
    "configuration event",
    await db
      .from("audit_events")
      .select("actor_id, payload")
      .eq("event_type", "configuration")
      .eq("payload->>call_id", callId),
  );
  assert.equal(event.actor_id, ids.admin);
  assert.deepEqual(event.payload.units, [{ unit: "generation_tokens", amount: 100 }]);
  assert.equal(event.payload.reason_code, "reconcile:charged_conservatively");

  // Nothing unresolved is left: a second charge finds nothing and changes nothing.
  assert.equal((await reconcile(callId)).error?.message, "NOT_FOUND");
  assert.deepEqual(await reservations(callId), after);
});

test("reconcile_reservation leaves a settled call untouched", async () => {
  const callId = await reservedCall();
  await rpc("finish_call", {
    p_call_id: callId,
    p_actuals: [
      { unit: "generation_tokens", actual: 40 },
      { unit: "generation_ms", actual: 7 },
    ],
  });
  const rows = await reservations(callId);
  assert.equal((await reconcile(callId)).error?.message, "NOT_FOUND");
  assert.deepEqual(await reservations(callId), rows);
  assert.ok(rows.every((r) => r.state === "settled"));
});
