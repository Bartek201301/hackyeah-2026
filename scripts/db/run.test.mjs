// test:db — run RPCs against the shared project (start_run, finalize_run; T03 migration C).
// Manual, never CI. Its only writes: reviewer runs labelled db_test_run/db_test_execute, their audit events
// and actor_activity rows with operation db_test (kept off the employee demo dashboard). Every value is
// synthetic. No reservations and no cleanup deletes (audit is append-only).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anon, fixtures, must, signIn } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const db = admin();
let reviewer;
let head;
let settled;

before(async () => {
  const { email } = fixtures.accounts.find((account) => account.alias === "reviewer");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  reviewer = users.find((user) => user.email === email).id;
  head = must(
    "head",
    await db.from("control_heads").select("policy_version, feed_version").eq("organisation_id", ORG).single(),
  );
});

const rpc = async (name, args) => must(name, await db.rpc(name, args));
const startArgs = (overrides = {}) => ({
  p_organisation_id: ORG,
  p_actor_id: reviewer,
  p_operation: "db_test_run",
  p_kind: "chat",
  p_idempotency_key: randomUUID(),
  p_request_sha256: "h1",
  p_trace_id: randomUUID(),
  p_input_private: { message: "synthetic db_test input" },
  ...overrides,
});
const outcome = (overrides = {}) => ({
  run_state: "blocked",
  operation_state: "denied",
  decision: "BLOCK",
  reasons: ["test:block"],
  usage: { semantic_ms: 0, unresolved_reservation: false },
  operation: "db_test",
  stage: "input_signature",
  result: { status: 403, decision: "BLOCK" },
  event: { stage: "input_signature" },
  ...overrides,
});

/** A started run claimed with an admin lease, plus its execute operation, as run_execute does it. */
async function claimed() {
  const run = await rpc("start_run", startArgs());
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
  return { run, lease, operationId: op.operation_id };
}
const finalize = (claim, result, { lease = claim.lease, operationId = claim.operationId } = {}) =>
  db.rpc("finalize_run", {
    p_run_id: claim.run.run_id,
    p_lease_token: lease,
    p_operation_id: operationId,
    p_outcome: result,
  });
const events = async (trace, type) =>
  must(
    "events",
    await db
      .from("audit_events")
      .select("operation_id, payload")
      .eq("trace_id", trace)
      .eq("event_type", type),
  );
const activity = async (trace) =>
  must(
    "activity",
    await db
      .from("actor_activity")
      .select("operation, state, decision, reasons, policy_version, feed_version")
      .eq("trace_id", trace),
  );

test("start_run creates one run and intent, and replays idempotently", async () => {
  const args = startArgs();
  const first = await rpc("start_run", args);
  assert.equal(first.replay, false);
  assert.equal(first.run_id, args.p_trace_id);
  assert.deepEqual(
    [first.kind, first.state, first.stage, first.policy_version, first.feed_version],
    ["chat", "pending", "queued", head.policy_version, head.feed_version],
  );
  const run = must(
    "run",
    await db.from("runs").select("id, state, stage, actor_id").eq("id", first.run_id).single(),
  );
  assert.deepEqual(run, { id: args.p_trace_id, state: "pending", stage: "queued", actor_id: reviewer });
  const op = must(
    "operation",
    await db.from("operations").select("state, run_id").eq("id", first.operation_id).single(),
  );
  assert.deepEqual(op, { state: "completed", run_id: args.p_trace_id });
  const intents = async () =>
    must(
      "intents",
      await db
        .from("audit_events")
        .select("trace_id")
        .eq("operation_id", first.operation_id)
        .eq("event_type", "intent"),
    );
  assert.deepEqual(await intents(), [{ trace_id: args.p_trace_id }]);

  assert.deepEqual(await rpc("start_run", { ...args, p_trace_id: randomUUID() }), { ...first, replay: true });
  assert.equal((await intents()).length, 1);
  assert.equal((await db.rpc("start_run", { ...args, p_request_sha256: "h2" })).error?.message, "CONFLICT");
  assert.equal((await db.rpc("start_run", { ...args, p_kind: "export" })).error?.message, "CONFLICT");
  assert.equal(
    (await db.rpc("start_run", startArgs({ p_actor_id: randomUUID() }))).error?.message,
    "ACCESS_DENIED",
  );
});

test("finalize_run settles under the lease with versions from the operation", async () => {
  const claim = await claimed();
  const trace = claim.run.run_id;
  assert.equal((await finalize(claim, outcome(), { lease: randomUUID() })).error?.message, "CONFLICT");
  assert.equal(
    (await finalize(claim, outcome(), { operationId: claim.run.operation_id })).error?.message,
    "CONFLICT",
    "the completed start operation cannot be settled again",
  );
  assert.equal((await finalize(claim, outcome(), { operationId: randomUUID() })).error?.message, "NOT_FOUND");

  assert.deepEqual(must("finalize", await finalize(claim, outcome())), { finalized: true, state: "blocked" });
  const run = must(
    "run",
    await db.from("runs").select("state, stage, lease_token, lease_expires_at").eq("id", trace).single(),
  );
  assert.deepEqual(run, {
    state: "blocked",
    stage: "input_signature",
    lease_token: null,
    lease_expires_at: null,
  });
  const op = must(
    "operation",
    await db.from("operations").select("state").eq("id", claim.operationId).single(),
  );
  assert.equal(op.state, "denied");
  assert.deepEqual(await events(trace, "decision"), [
    { operation_id: claim.operationId, payload: { stage: "input_signature" } },
  ]);
  assert.deepEqual(await activity(trace), [
    {
      operation: "db_test",
      state: "blocked",
      decision: "BLOCK",
      reasons: ["test:block"],
      policy_version: head.policy_version,
      feed_version: head.feed_version,
    },
  ]);
  settled = claim;
});

test("a second finalize_run writes nothing", async () => {
  const again = must(
    "finalize again",
    await finalize(settled, outcome({ decision: "ALLOW", run_state: "completed" })),
  );
  assert.deepEqual(again, { finalized: false, state: "blocked" });
  assert.equal((await events(settled.run.run_id, "decision")).length, 1);
  assert.equal((await activity(settled.run.run_id)).length, 1);
});

test("finalize_run on an unclaimed run writes nothing", async () => {
  const run = await rpc("start_run", startArgs());
  const result = must(
    "finalize pending",
    await finalize({ run, lease: randomUUID(), operationId: run.operation_id }, outcome()),
  );
  assert.deepEqual(result, { finalized: false, state: "pending" });
  assert.equal((await events(run.run_id, "decision")).length, 0);
  assert.equal((await events(run.run_id, "incomplete")).length, 0);
  assert.equal((await activity(run.run_id)).length, 0);
});

test("a null decision records an incomplete event", async () => {
  const claim = await claimed();
  const result = must(
    "finalize incomplete",
    await finalize(
      claim,
      outcome({
        decision: null,
        run_state: "incomplete",
        operation_state: "unknown",
        reasons: [],
        result: null,
      }),
    ),
  );
  assert.deepEqual(result, { finalized: true, state: "incomplete" });
  assert.equal((await events(claim.run.run_id, "incomplete")).length, 1);
  assert.equal((await events(claim.run.run_id, "decision")).length, 0);
});

test("an invalid outcome is rejected", async () => {
  const claim = await claimed();
  for (const bad of [
    { run_state: "pending" },
    { reasons: ["x".repeat(81)] },
    { usage: { note: { nested: 1 } } },
  ])
    assert.equal(
      (await finalize(claim, outcome(bad))).error?.message,
      "INVALID_INPUT",
      JSON.stringify(Object.keys(bad)),
    );
  const run = must("run", await db.from("runs").select("state").eq("id", claim.run.run_id).single());
  assert.equal(run.state, "running");
});

test("anon and signed-in sessions cannot execute the run RPCs", async () => {
  const { client } = await signIn("reviewer");
  const args = startArgs();
  try {
    for (const [who, caller] of [
      ["anon", anon()],
      ["reviewer", client],
    ]) {
      assert.equal((await caller.rpc("start_run", args)).error?.code, "42501", `${who} start_run`);
      assert.equal(
        (
          await caller.rpc("finalize_run", {
            p_run_id: randomUUID(),
            p_lease_token: randomUUID(),
            p_operation_id: randomUUID(),
            p_outcome: outcome(),
          })
        ).error?.code,
        "42501",
        `${who} finalize_run`,
      );
    }
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
  assert.deepEqual(
    must("re-read", await db.from("operations").select("id").eq("idempotency_key", args.p_idempotency_key)),
    [],
  );
  assert.deepEqual(must("re-read run", await db.from("runs").select("id").eq("id", args.p_trace_id)), []);
});
