// test:db — operation and reservation RPCs against the shared project (AT08 DB part).
// Manual, never CI. Its only writes: labelled db_test operations, their audit events and reservations in
// 2000-01-01 buckets, so today's demo budgets are untouched. No cleanup deletes (audit is append-only).
// Limits are computed from the current bucket state, so every assertion stays exact across reruns.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anon, fixtures, must, signIn } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const PERIOD = "2000-01-01";
const UNIT = "generation_tokens";
const db = admin();
let employee;
let race;

before(async () => {
  const { email } = fixtures.accounts.find((account) => account.alias === "employee");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  employee = users.find((user) => user.email === email).id;
});

const rpc = async (name, args) => must(name, await db.rpc(name, args));
const opArgs = (overrides = {}) => ({
  p_organisation_id: ORG,
  p_actor_id: employee,
  p_operation: "db_test",
  p_idempotency_key: randomUUID(),
  p_request_sha256: "h1",
  p_trace_id: randomUUID(),
  ...overrides,
});
// The org limit never binds, so only the actor allowance decides.
const reserveArgs = (operationId, callId, amount, actorLimit) => ({
  p_operation_id: operationId,
  p_call_id: callId,
  p_provider: "db_test",
  p_period_start: PERIOD,
  p_units: [{ unit: UNIT, amount, actor_limit: actorLimit, org_limit: 1e15 }],
});
const finish = (callId, actual) =>
  rpc("finish_call", { p_call_id: callId, p_actuals: [{ unit: UNIT, actual }] });
const reservations = async (callId) =>
  must(
    "reservations",
    await db.from("reservations").select("id, bucket_id, state, actual").eq("call_id", callId),
  );

async function actorBucket() {
  const rows = must(
    "bucket",
    await db
      .from("budget_buckets")
      .select("id, spent, reserved")
      .eq("organisation_id", ORG)
      .eq("scope_kind", "actor")
      .eq("scope_id", employee)
      .eq("unit", UNIT)
      .eq("period_start", PERIOD),
  );
  return rows[0] ?? { id: null, spent: 0, reserved: 0 };
}

const todayBuckets = async () =>
  must(
    "today buckets",
    await db
      .from("budget_buckets")
      .select("id")
      .eq("organisation_id", ORG)
      .eq("period_start", new Date().toISOString().slice(0, 10)),
  ).length;

test("begin_operation records one intent and replays idempotently", async () => {
  const head = must(
    "head",
    await db.from("control_heads").select("policy_version, feed_version").eq("organisation_id", ORG).single(),
  );
  const args = opArgs();
  const first = await rpc("begin_operation", args);
  assert.equal(first.replay, false);
  assert.equal(first.state, "intent");
  assert.deepEqual([first.policy_version, first.feed_version], [head.policy_version, head.feed_version]);
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

  assert.deepEqual(await rpc("begin_operation", { ...args, p_trace_id: randomUUID() }), {
    ...first,
    replay: true,
  });
  assert.equal((await intents()).length, 1);
  assert.equal(
    (await db.rpc("begin_operation", { ...args, p_request_sha256: "h2" })).error?.message,
    "CONFLICT",
  );
  assert.equal(
    (await db.rpc("begin_operation", opArgs({ p_actor_id: randomUUID() }))).error?.message,
    "ACCESS_DENIED",
  );
});

test("two concurrent reservations with allowance for one: exactly one wins", async (t) => {
  const start = await actorBucket();
  const limit = start.spent + start.reserved + 150;
  const ops = await Promise.all([rpc("begin_operation", opArgs()), rpc("begin_operation", opArgs())]);
  const calls = [randomUUID(), randomUUID()];
  const results = await Promise.all(
    ops.map((op, i) => db.rpc("reserve_call", reserveArgs(op.operation_id, calls[i], 100, limit))),
  );
  const winners = results.flatMap((result, i) => (result.error ? [] : [i]));
  assert.equal(winners.length, 1, "exactly one reservation succeeds");
  const [winner] = winners;
  const loser = 1 - winner;
  assert.equal(results[loser].error.message, "BUDGET_EXHAUSTED");
  assert.equal(results[winner].data.replay, false);

  const end = await actorBucket();
  assert.equal(end.reserved - start.reserved, 100);
  assert.equal(end.spent, start.spent);
  assert.equal((await reservations(calls[loser])).length, 0);
  assert.equal((await reservations(calls[winner])).length, 2);
  t.diagnostic(`winner call #${winner + 1}, loser call #${loser + 1} BUDGET_EXHAUSTED, actor reserved +100`);
  race = {
    op: ops[winner].operation_id,
    call: calls[winner],
    limit,
    start,
    ids: results[winner].data.reservation_ids,
  };
});

test("a retried reserve_call replays without reserving twice", async () => {
  const bucket = await actorBucket();
  const again = await rpc("reserve_call", reserveArgs(race.op, race.call, 100, race.limit));
  assert.deepEqual(again, { reservation_ids: race.ids, replay: true });
  assert.deepEqual(await actorBucket(), bucket);
});

test("concurrent duplicate finish_call settles once", async () => {
  race.todayBuckets = await todayBuckets();
  const results = await Promise.all([finish(race.call, 40), finish(race.call, 40)]);
  assert.deepEqual(results.map((result) => result.settled).sort(), [0, 2]);
  const end = await actorBucket();
  assert.equal(end.reserved, race.start.reserved);
  assert.equal(end.spent, race.start.spent + 40);
  for (const row of await reservations(race.call)) assert.deepEqual([row.state, row.actual], ["settled", 40]);
  const completions = must(
    "completions",
    await db
      .from("audit_events")
      .select("payload")
      .eq("operation_id", race.op)
      .eq("event_type", "completion"),
  );
  assert.equal(
    completions.filter(({ payload }) => payload.call_id === race.call && payload.settled > 0).length,
    1,
  );
});

test("unknown usage stays reserved until a known actual settles it", async () => {
  const start = await actorBucket();
  const op = await rpc("begin_operation", opArgs());
  const call = randomUUID();
  await rpc("reserve_call", reserveArgs(op.operation_id, call, 10, start.spent + start.reserved + 10));
  assert.deepEqual(await finish(call, null), { settled: 0, unresolved: 2, overrun: false });
  for (const row of await reservations(call)) assert.deepEqual([row.state, row.actual], ["unresolved", null]);
  const pending = await actorBucket();
  assert.deepEqual([pending.reserved, pending.spent], [start.reserved + 10, start.spent]);

  assert.deepEqual(await finish(call, 7), { settled: 2, unresolved: 0, overrun: false });
  const end = await actorBucket();
  assert.deepEqual([end.reserved, end.spent], [start.reserved, start.spent + 7]);
});

test("an overrun is recorded in full", async () => {
  const start = await actorBucket();
  const op = await rpc("begin_operation", opArgs());
  const call = randomUUID();
  await rpc("reserve_call", reserveArgs(op.operation_id, call, 10, start.spent + start.reserved + 10));
  assert.deepEqual(await finish(call, 25), { settled: 2, unresolved: 0, overrun: true });
  const end = await actorBucket();
  assert.deepEqual([end.reserved, end.spent], [start.reserved, start.spent + 25]);
});

test("settlement stays in the original 2000-01-01 buckets", async () => {
  const bucketIds = (await reservations(race.call)).map((row) => row.bucket_id);
  const buckets = must(
    "buckets",
    await db.from("budget_buckets").select("id, period_start").in("id", bucketIds),
  );
  assert.equal(buckets.length, 2);
  assert.ok(buckets.every((bucket) => bucket.period_start === PERIOD));
  assert.ok(bucketIds.includes((await actorBucket()).id));
  assert.equal(await todayBuckets(), race.todayBuckets, "finish_call created no bucket for today");
});

test("anon and employee sessions cannot execute the RPCs", async () => {
  const { client } = await signIn("employee");
  const key = randomUUID();
  try {
    for (const [who, caller] of [
      ["anon", anon()],
      ["employee", client],
    ]) {
      for (const [name, args] of [
        ["begin_operation", opArgs({ p_idempotency_key: key })],
        ["reserve_call", reserveArgs(randomUUID(), randomUUID(), 1, 1)],
        ["finish_call", { p_call_id: randomUUID(), p_actuals: [] }],
      ])
        assert.equal((await caller.rpc(name, args)).error?.code, "42501", `${who} ${name}`);
    }
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
  assert.deepEqual(must("re-read", await db.from("operations").select("id").eq("idempotency_key", key)), []);
});
