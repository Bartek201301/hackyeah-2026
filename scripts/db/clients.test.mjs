// test:db — create_client, update_client and record_client_review (migration L) against the shared project.
// Manual, never CI. Its writes: synthetic clients named "db_test client …" (deleted again in after()),
// their client_create/client_update/client_delete operations, audit events and actor_activity rows
// (audit is append-only, so those stay). Every value is synthetic.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { admin, anon, fixtures, must, signIn } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const db = admin();
const ids = {};
const created = [];

before(async () => {
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  for (const { alias, email } of fixtures.accounts) ids[alias] = users.find((u) => u.email === email).id;
});

after(async () => {
  if (created.length) must("cleanup", await db.from("clients").delete().in("id", created));
});

const sha = () => createHash("sha256").update(randomUUID()).digest("hex");
const rpc = async (name, args) => must(name, await db.rpc(name, args));
const errorOf = async (name, args) => (await db.rpc(name, args)).error?.message;
const createArgs = (alias, client, overrides = {}) => ({
  p_organisation_id: ORG,
  p_actor_id: ids[alias],
  p_idempotency_key: randomUUID(),
  p_request_sha256: sha(),
  p_client: client,
  ...overrides,
});
const updateArgs = (alias, clientId, expectedVersion, changes, overrides = {}) => ({
  p_organisation_id: ORG,
  p_actor_id: ids[alias],
  p_idempotency_key: randomUUID(),
  p_request_sha256: sha(),
  p_client_id: clientId,
  p_expected_version: expectedVersion,
  p_changes: changes,
  ...overrides,
});
const clientRow = async (id) => must("client", await db.from("clients").select("*").eq("id", id).single());
const decisionFor = async (operation, idempotencyKey) => {
  const [op] = must(
    "operation",
    await db
      .from("operations")
      .select("id, state")
      .eq("organisation_id", ORG)
      .eq("operation", operation)
      .eq("idempotency_key", idempotencyKey),
  );
  const [event] = must(
    "decision event",
    await db
      .from("audit_events")
      .select("trace_id, payload")
      .eq("operation_id", op.id)
      .eq("event_type", "decision"),
  );
  const [activity] = must(
    "activity",
    await db.from("actor_activity").select("operation, state, decision").eq("trace_id", event.trace_id),
  );
  return { op, event, activity };
};

test("create_client writes once with an ALLOW audit free of names, notes and amounts", async () => {
  const client = {
    name: `db_test client ${randomUUID()}`,
    sector: "Synthetic logistics",
    notes: "db_test synthetic note",
    annual_fee_usd: 123457,
  };
  const args = createArgs("analyst", client);
  const first = await rpc("create_client", args);
  created.push(first.client_id);
  assert.deepEqual(first, { client_id: first.client_id, version: 1, replayed: false });
  const row = await clientRow(first.client_id);
  assert.deepEqual(
    [row.organisation_id, row.name, row.status, row.annual_fee_usd, row.version, row.created_by],
    [ORG, client.name, "active", 123457, 1, ids.analyst],
  );

  const { op, event, activity } = await decisionFor("client_create", args.p_idempotency_key);
  assert.equal(op.state, "completed");
  assert.deepEqual(
    [event.payload.decision, event.payload.client_id, event.payload.version, event.payload.fields],
    ["ALLOW", first.client_id, 1, ["annual_fee_usd", "name", "notes", "sector"]],
  );
  const text = JSON.stringify(event.payload);
  for (const secret of [client.name, client.notes, client.sector, "123457"])
    assert.ok(!text.includes(secret));
  assert.deepEqual(activity, { operation: "client_create", state: "completed", decision: "ALLOW" });

  // Same key and hash: the first result, no second row. Another request under the key conflicts.
  assert.deepEqual(await rpc("create_client", args), { ...first, replayed: true });
  const rows = must("rows", await db.from("clients").select("id").eq("name", client.name));
  assert.equal(rows.length, 1);
  assert.equal(await errorOf("create_client", { ...args, p_request_sha256: sha() }), "CONFLICT");
  assert.equal(
    await errorOf("create_client", createArgs("analyst", { name: client.name, annual_fee_usd: 1.5 })),
    "INVALID_INPUT",
  );
});

test("update_client compares and sets the version and changes only allowed fields", async () => {
  const { client_id: id } = await rpc(
    "create_client",
    createArgs("admin", { name: `db_test client ${randomUUID()}`, annual_fee_usd: 1000 }),
  );
  created.push(id);
  const args = updateArgs("analyst", id, 1, { annual_fee_usd: 2000, status: "paused" });
  const first = await rpc("update_client", args);
  assert.deepEqual(first, { client_id: id, version: 2, replayed: false });

  // Stale version: CONFLICT and nothing changes.
  assert.equal(await errorOf("update_client", updateArgs("analyst", id, 1, { notes: "late" })), "CONFLICT");
  const second = await rpc("update_client", updateArgs("admin", id, 2, { sector: "Synthetic" }));
  assert.equal(second.version, 3);
  // Replay after a later update still returns the first result.
  assert.deepEqual(await rpc("update_client", args), { ...first, replayed: true });
  const row = await clientRow(id);
  assert.deepEqual(
    [row.annual_fee_usd, row.status, row.sector, row.notes, row.version],
    [2000, "paused", "Synthetic", null, 3],
  );

  const { event } = await decisionFor("client_update", args.p_idempotency_key);
  assert.deepEqual(
    [event.payload.decision, event.payload.version, event.payload.fields],
    ["ALLOW", 2, ["annual_fee_usd", "status"]],
  );
  assert.ok(!JSON.stringify(event.payload).includes("2000"));
  assert.equal(await errorOf("update_client", updateArgs("analyst", id, 3, { name: "x" })), "INVALID_INPUT");
  assert.equal(
    await errorOf("update_client", updateArgs("analyst", randomUUID(), 1, { notes: "x" })),
    "NOT_FOUND",
  );
});

test("employee and external roles are denied and nothing is written", async () => {
  const name = `db_test client ${randomUUID()}`;
  for (const alias of ["employee", "reviewer"]) {
    assert.equal(await errorOf("create_client", createArgs(alias, { name })), "ACCESS_DENIED");
  }
  assert.equal(must("rows", await db.from("clients").select("id").eq("name", name)).length, 0);
  const { client_id: id } = await rpc("create_client", createArgs("analyst", { name }));
  created.push(id);
  assert.equal(
    await errorOf("update_client", updateArgs("employee", id, 1, { notes: "x" })),
    "ACCESS_DENIED",
  );
  assert.equal((await clientRow(id)).version, 1);
});

test("record_client_review records a held delete and writes nothing else", async () => {
  const { client_id: id } = await rpc(
    "create_client",
    createArgs("admin", { name: `db_test client ${randomUUID()}` }),
  );
  created.push(id);
  const args = {
    p_organisation_id: ORG,
    p_actor_id: ids.admin,
    p_operation: "client_delete",
    p_idempotency_key: randomUUID(),
    p_request_sha256: sha(),
    p_reasons: ["DB_TEST_HELD"],
    p_client_id: id,
    p_fields: null,
  };
  const first = await rpc("record_client_review", args);
  assert.equal((await rpc("record_client_review", args)).trace_id, first.trace_id);
  assert.equal(await errorOf("record_client_review", { ...args, p_request_sha256: sha() }), "CONFLICT");
  const { op, event, activity } = await decisionFor("client_delete", args.p_idempotency_key);
  assert.equal(op.state, "denied");
  assert.deepEqual([event.payload.decision, event.payload.client_id], ["REVIEW", id]);
  assert.deepEqual(activity, { operation: "client_delete", state: "review", decision: "REVIEW" });
  assert.equal((await clientRow(id)).version, 1);
});

test("anon and signed-in browser clients cannot execute the RPCs or read clients", async () => {
  const { client: analyst } = await signIn("analyst");
  for (const client of [anon(), analyst]) {
    const { error } = await client.rpc("create_client", createArgs("analyst", { name: "db_test x" }));
    assert.equal(error?.code, "42501");
    assert.equal((await client.from("clients").select("id")).error?.code, "42501");
  }
});
