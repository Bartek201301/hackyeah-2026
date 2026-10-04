// Real PostgreSQL SQL/PLpgSQL in an isolated WASM database. No env file, network or shared Supabase.
// PGlite has one connection: these tests prove transactional semantics, not multi-backend lock stress.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db;
before(async () => {
  db = new PGlite();
  // Minimal Supabase auth/roles for the real core migration. Its RLS and grants run unchanged.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  for (const file of [
    "20261003152115_core_schema.sql",
    "20261003162224_operation_rpcs.sql",
    "20261004000500_policy_update.sql",
  ])
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
});
after(async () => {
  await db?.close();
});

async function fixture() {
  const org = randomUUID(),
    admin = randomUUID(),
    employee = randomUUID();
  await db.query("insert into auth.users(id) values ($1),($2)", [admin, employee]);
  await db.query("insert into organisations(id,name) values ($1,'Synthetic policy test')", [org]);
  await db.query(
    "insert into memberships(organisation_id,actor_id,role) values ($1,$2,'admin'),($1,$3,'employee')",
    [org, admin, employee],
  );
  await db.query(
    "insert into policy_versions(organisation_id,version,document,sha256,created_by) values ($1,1,'{}','seed',$2)",
    [org, admin],
  );
  await db.query(
    "insert into feed_versions(organisation_id,version,document,sha256,source,expires_at,created_by) values ($1,1,'{}','seed','test',now()+interval '1 day',$2)",
    [org, admin],
  );
  await db.query("insert into control_heads(organisation_id,policy_version,feed_version) values ($1,1,1)", [
    org,
  ]);
  return { org, admin, employee, key: randomUUID() };
}
async function asRole(role, fn) {
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function update(
  f,
  { actor = f.admin, expected = 1, key = f.key, hash = "a".repeat(64), role = "service_role" } = {},
) {
  // Full policy validation is exercised in gateway tests. This fixture intentionally only needs the
  // fields SQL owns (version); the service-only RPC does not duplicate the application JSON schema.
  const result = await asRole(role, () =>
    db.query("select update_policy($1,$2,$3,$4,$5::jsonb,$6,$7) as result", [
      f.org,
      actor,
      key,
      expected,
      JSON.stringify({ version: expected + 1 }),
      hash,
      "b".repeat(64),
    ]),
  );
  return result.rows[0].result;
}
async function state(f) {
  const { rows } = await db.query(
    `select policy_version,revision,
    (select count(*)::int from policy_versions where organisation_id=$1) as snapshots,
    (select count(*)::int from operations where organisation_id=$1) as operations,
    (select count(*)::int from audit_events where organisation_id=$1) as events,
    (select count(*)::int from actor_activity where organisation_id=$1) as activity
    from control_heads where organisation_id=$1`,
    [f.org],
  );
  return rows[0];
}

test("policy snapshot, head, intent, configuration and safe activity commit together", async () => {
  const f = await fixture();
  const result = await update(f);
  assert.equal(result.policy_version, 2);
  assert.equal(result.feed_version, 1);
  assert.equal(typeof result.trace_id, "string");
  assert.deepEqual(await state(f), {
    policy_version: 2,
    revision: 2,
    snapshots: 2,
    operations: 1,
    events: 2,
    activity: 1,
  });
  const events = (await db.query("select payload from audit_events where organisation_id=$1", [f.org])).rows;
  assert.ok(events.every((e) => !("document" in e.payload)));
  const replay = await update(f);
  assert.deepEqual(replay, result);
  assert.equal((await state(f)).events, 2);
  await update(f, { expected: 2, key: randomUUID(), hash: "c".repeat(64) });
  assert.deepEqual(await update(f), result, "an older successful retry keeps its original version and trace");
  assert.equal((await state(f)).snapshots, 3);
});

test("stale writers and a changed body under the same key cannot append versions or audit", async () => {
  const f = await fixture();
  await update(f);
  const committed = await state(f);
  await assert.rejects(update(f, { key: randomUUID() }), /CONFLICT/);
  await assert.rejects(update(f, { hash: "c".repeat(64) }), /CONFLICT/);
  assert.deepEqual(await state(f), committed);
});

test("database derives admin membership and rejects another tenant, employee and revoked admin", async () => {
  const f = await fixture(),
    other = await fixture();
  const original = await state(f);
  await assert.rejects(update(f, { actor: f.employee }), /ACCESS_DENIED/);
  await assert.rejects(update(f, { actor: other.admin }), /ACCESS_DENIED/);
  await db.query("update memberships set active=false where organisation_id=$1 and actor_id=$2", [
    f.org,
    f.admin,
  ]);
  await assert.rejects(update(f), /ACCESS_DENIED/);
  assert.deepEqual(await state(f), original);
});

test("browser roles cannot invoke policy mutation and service_role cannot rewrite history", async () => {
  const f = await fixture();
  for (const role of ["anon", "authenticated"])
    await assert.rejects(update(f, { role }), /permission denied/);
  await assert.rejects(
    asRole("service_role", () =>
      db.query("update policy_versions set document='{}' where organisation_id=$1", [f.org]),
    ),
    /permission denied/,
  );
  assert.equal((await state(f)).policy_version, 1);
});

test("audit failure rolls back snapshot, head and intent; the same key can safely retry", async () => {
  const f = await fixture();
  const original = await state(f);
  await db.exec(`create function public.test_fail_audit() returns trigger language plpgsql as $$
    begin if new.event_type='configuration' then raise exception 'synthetic audit unavailable'; end if;
    return new; end $$;
    create trigger test_fail_audit before insert on audit_events for each row execute function test_fail_audit();`);
  try {
    await assert.rejects(update(f), /synthetic audit unavailable/);
    assert.deepEqual(await state(f), original);
  } finally {
    await db.exec("drop trigger test_fail_audit on audit_events; drop function public.test_fail_audit();");
  }
  assert.equal((await update(f)).policy_version, 2);
});
