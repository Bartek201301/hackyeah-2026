import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let db;
const migration = (name) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to service_role;`);
  await db.exec(migration("20261003152115_core_schema.sql"));
  await db.exec(migration("20261003162224_operation_rpcs.sql"));
  await db.exec(`create type public.token_audience as enum ('public','feed');
    create table public.access_tokens (
      id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
      actor_id uuid not null, token_sha256 text not null unique, scopes text[] not null,
      audience public.token_audience not null, expires_at timestamptz not null,
      revoked_at timestamptz, created_at timestamptz not null default now(),
      foreign key (organisation_id,actor_id) references public.memberships(organisation_id,actor_id));
    alter table public.access_tokens enable row level security;
    revoke all on public.access_tokens from anon, authenticated;`);
  await db.exec(migration("20261004034000_guard_finalization.sql"));
});
after(async () => {
  await db?.close();
});

async function asRole(role, fn) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function fixture() {
  const org = randomUUID(),
    actor = randomUUID(),
    token = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [actor]);
  await db.query("insert into organisations(id,name) values ($1,'Guard test')", [org]);
  await db.query("insert into memberships(organisation_id,actor_id,role) values ($1,$2,'admin')", [
    org,
    actor,
  ]);
  await db.query(
    "insert into policy_versions(organisation_id,version,document,sha256,created_by) values ($1,1,'{}','seed',$2)",
    [org, actor],
  );
  await db.query(
    "insert into feed_versions(organisation_id,version,document,sha256,source,expires_at,created_by) values ($1,1,'{}','seed','test',now()+interval '1 day',$2)",
    [org, actor],
  );
  await db.query("insert into control_heads(organisation_id,policy_version,feed_version) values ($1,1,1)", [
    org,
  ]);
  await db.query(
    "insert into access_tokens(id,organisation_id,actor_id,token_sha256,scopes,audience,expires_at) values ($1,$2,$3,$4,array['guard:prompt'],'public',now()+interval '4 hours')",
    [token, org, actor, randomUUID()],
  );
  const begun = await asRole("service_role", () =>
    db.query("select begin_operation($1,$2,'claude_prompt',$3,'abc',$4,null) as result", [
      org,
      actor,
      randomUUID(),
      randomUUID(),
    ]),
  );
  return { org, actor, token, operation: begun.rows[0].result.operation_id };
}
const usage = {
  generation_input_tokens: 0,
  generation_output_tokens: 0,
  generation_ms: 0,
  semantic_input_tokens: 4,
  semantic_ms: 20,
  reserved_generation_tokens: 0,
  unresolved_reservation: false,
  comparison_micro_usd: 0,
  comparison_rate_version: "test",
};
async function finalize(
  f,
  { role = "service_role", decision = "ALLOW", unknown = false, scope = "guard:prompt" } = {},
) {
  const result = await asRole(role, () =>
    db.query("select finalize_guard_check($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10) as result", [
      f.operation,
      f.org,
      f.actor,
      f.token,
      scope,
      decision,
      JSON.stringify([]),
      JSON.stringify(usage),
      JSON.stringify({ stage: "claude_prompt", semantic_status: "complete" }),
      unknown,
    ]),
  );
  return result.rows[0].result;
}

test("an allowed guard check commits operation, decision event and safe activity together", async () => {
  const f = await fixture();
  const done = await finalize(f);
  assert.equal(done.decision, "ALLOW");
  const state = (await db.query("select state from operations where id=$1", [f.operation])).rows[0].state;
  assert.equal(state, "completed");
  const activity = (
    await db.query("select decision,usage from actor_activity where trace_id=$1", [done.trace_id])
  ).rows[0];
  assert.equal(activity.decision, "ALLOW");
  assert.deepEqual(activity.usage, usage);
  assert.equal(
    (await db.query("select count(*)::int as n from audit_events where operation_id=$1", [f.operation]))
      .rows[0].n,
    2,
  );
  await assert.rejects(finalize(f), /CONFLICT/);
});

test("revoked token, changed policy and unknown provider usage cannot approve", async () => {
  const revoked = await fixture();
  await db.query("update access_tokens set revoked_at=now() where id=$1", [revoked.token]);
  assert.equal((await finalize(revoked)).decision, "BLOCK");
  const changed = await fixture();
  await db.query(
    "insert into policy_versions(organisation_id,version,document,sha256,created_by) values ($1,2,'{}','next',$2)",
    [changed.org, changed.actor],
  );
  await db.query("update control_heads set policy_version=2 where organisation_id=$1", [changed.org]);
  assert.equal((await finalize(changed)).decision, "BLOCK");
  const unresolved = await fixture();
  assert.equal((await finalize(unresolved, { unknown: true })).decision, "BLOCK");
  assert.equal(
    (await db.query("select state from operations where id=$1", [unresolved.operation])).rows[0].state,
    "unknown",
  );
});

test("a hook operation cannot be finalized under an excerpt scope", async () => {
  const f = await fixture();
  await assert.rejects(finalize(f, { scope: "excerpt:read" }), /ACCESS_DENIED/);
  assert.equal(
    (await db.query("select state from operations where id=$1", [f.operation])).rows[0].state,
    "intent",
  );
});

test("browser roles cannot call finalization and a failed audit rolls back an allow", async () => {
  const f = await fixture();
  for (const role of ["anon", "authenticated"])
    await assert.rejects(finalize(f, { role }), /permission denied/);
  const meta = (
    await db.query(`select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='finalize_guard_check'`)
  ).rows[0];
  assert.equal(meta.prosecdef, false);
  await db.exec(`create function public.fail_guard_audit() returns trigger language plpgsql as $$
    begin if new.event_type='decision' then raise exception 'synthetic audit failure'; end if;
    return new; end $$;
    create trigger fail_guard_audit before insert on audit_events for each row execute function fail_guard_audit();`);
  try {
    await assert.rejects(finalize(f), /synthetic audit failure/);
  } finally {
    await db.exec("drop trigger fail_guard_audit on audit_events; drop function public.fail_guard_audit();");
  }
  assert.equal(
    (await db.query("select state from operations where id=$1", [f.operation])).rows[0].state,
    "intent",
  );
  assert.equal(
    (await db.query("select count(*)::int as n from actor_activity where organisation_id=$1", [f.org]))
      .rows[0].n,
    0,
  );
});
