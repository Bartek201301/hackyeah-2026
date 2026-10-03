// test:db — real-JWT identity and RLS probes against the shared project (AT02 DB part, AT17 tables).
// Manual, never CI. Its only writes: the analyst membership toggled inactive (restored in finally);
// every other write attempt must fail.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anon, config, fixtures, must, signIn } from "./clients.mjs";

const PROJECTIONS = ["memberships", "deal_memberships", "actor_activity"];
const HIDDEN = [
  "organisations",
  "deals",
  "sources",
  "dataset_rows",
  "documents",
  "excerpts",
  "policy_versions",
  "feed_versions",
  "control_heads",
  "runs",
  "operations",
  "budget_buckets",
  "reservations",
  "audit_events",
  "review_requests",
  "review_versions",
  "exports",
  "access_tokens",
];
const ORG = fixtures.organisation.id;
const dealIds = Object.fromEntries(fixtures.deals.map((deal) => [deal.alias, deal.id]));
const db = admin();
const sessions = {};
// Only a privilege denial or an empty result counts; a network or server error must not pass as denied.
const denied = ({ data, error }) => (error ? error.code === "42501" : data.length === 0);

before(async () => {
  for (const { alias } of fixtures.accounts) sessions[alias] = await signIn(alias);
});
after(() =>
  Promise.all(Object.values(sessions).map(({ client }) => client.auth.signOut({ scope: "local" }))),
);

test("public signup is disabled", async () => {
  const { url, key } = config();
  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
  assert.equal(settings.disable_signup, true);
  const email = `probe-${randomUUID()}@demo.example.invalid`;
  const { error } = await anon().auth.signUp({ email, password: randomUUID() });
  assert.ok(error, "anonymous signUp must fail");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  assert.ok(!users.some((user) => user.email === email), "probe user must not exist");
});

for (const account of fixtures.accounts)
  test(`${account.alias} sees only own membership, deals and activity`, async () => {
    const { client, uid } = sessions[account.alias];
    assert.deepEqual(
      must("memberships", await client.from("memberships").select("organisation_id, actor_id, role, active")),
      [{ organisation_id: ORG, actor_id: uid, role: account.role, active: true }],
    );
    const deals = must("deal_memberships", await client.from("deal_memberships").select("deal_id, actor_id"));
    assert.deepEqual(
      deals.map((row) => row.deal_id).sort(),
      account.deal_aliases.map((a) => dealIds[a]).sort(),
    );
    assert.ok(deals.every((row) => row.actor_id === uid));
    const activity = must("actor_activity", await client.from("actor_activity").select("actor_id"));
    assert.ok(activity.every((row) => row.actor_id === uid));
  });

test("seeded rows exist, so hidden means hidden rather than absent", async () => {
  for (const table of [
    "organisations",
    "deals",
    "policy_versions",
    "feed_versions",
    "control_heads",
    "sources",
    "dataset_rows",
  ])
    assert.ok(must(table, await db.from(table).select("*").limit(1)).length >= 1, `${table} has rows`);
});

for (const who of ["anon", ...fixtures.accounts.map((account) => account.alias)])
  test(`${who} reads nothing from base tables`, async () => {
    const client = who === "anon" ? anon() : sessions[who].client;
    for (const table of who === "anon" ? [...HIDDEN, ...PROJECTIONS] : HIDDEN)
      assert.ok(denied(await client.from(table).select("*").limit(5)), `${who} read ${table}`);
  });

// Write privileges belong to the database role (authenticated), not the app role, so employee stands
// in for all four. A random organisation matches no row, so even a wrong grant could not touch data.
for (const who of ["anon", "employee"])
  test(`${who} cannot insert, update or delete in any table`, async () => {
    const client = who === "anon" ? anon() : sessions[who].client;
    for (const table of [...HIDDEN, ...PROJECTIONS]) {
      const column = table === "organisations" ? "id" : "organisation_id";
      const nowhere = { [column]: randomUUID() };
      for (const [op, result] of [
        ["insert", await client.from(table).insert(nowhere)],
        ["update", await client.from(table).update(nowhere).eq(column, nowhere[column])],
        ["delete", await client.from(table).delete().eq(column, nowhere[column])],
      ])
        assert.equal(result.error?.code, "42501", `${who} ${op} ${table}`);
    }
  });

test("employee cannot forge role, membership, deal access, excerpts or audit", async () => {
  const { client, uid } = sessions.employee;
  const probe = randomUUID();
  assert.ok(denied(await client.from("memberships").update({ role: "admin" }).eq("actor_id", uid).select()));
  assert.ok(denied(await client.from("memberships").delete().eq("actor_id", uid).select()));
  for (const [table, row] of [
    ["memberships", { organisation_id: ORG, actor_id: uid, role: "admin" }],
    ["deal_memberships", { organisation_id: ORG, deal_id: dealIds.ASTER, actor_id: uid }],
    ["excerpts", { id: probe, organisation_id: ORG, text: "probe" }],
    ["audit_events", { id: probe, organisation_id: ORG, trace_id: probe, event_type: "intent" }],
  ]) {
    const { error } = await client.from(table).insert(row);
    assert.equal(error?.code, "42501", `${table} insert must be denied by privilege`);
  }
  assert.deepEqual(must("re-read", await db.from("memberships").select("role, active").eq("actor_id", uid)), [
    { role: "employee", active: true },
  ]);
  assert.deepEqual(must("re-read", await db.from("deal_memberships").select("id").eq("actor_id", uid)), []);
  assert.deepEqual(must("re-read", await db.from("excerpts").select("id").eq("id", probe)), []);
  assert.deepEqual(must("re-read", await db.from("audit_events").select("id").eq("id", probe)), []);
});

// Analyst, because only a member with a deal exercises the active check in both policies.
test("inactive membership hides the analyst's membership and deal access", async () => {
  const { client, uid } = sessions.analyst;
  const setActive = (active) =>
    db.from("memberships").update({ active }).eq("organisation_id", ORG).eq("actor_id", uid);
  try {
    must("deactivate", await setActive(false));
    assert.deepEqual(must("memberships", await client.from("memberships").select("id")), []);
    assert.deepEqual(must("deal_memberships", await client.from("deal_memberships").select("id")), []);
  } finally {
    must("restore", await setActive(true));
  }
  assert.deepEqual(must("re-read", await db.from("memberships").select("active").eq("actor_id", uid)), [
    { active: true },
  ]);
});

test("cross-org deal membership is rejected by the composite foreign key", async () => {
  const { error } = await db
    .from("deal_memberships")
    .insert({ organisation_id: randomUUID(), deal_id: dealIds.ASTER, actor_id: sessions.employee.uid });
  assert.equal(error?.code, "23503");
});

test("sign-out drops access", async () => {
  const { client } = await signIn("employee");
  assert.equal(must("before sign-out", await client.from("memberships").select("id")).length, 1);
  must("sign out", await client.auth.signOut({ scope: "local" }));
  assert.ok(denied(await client.from("memberships").select("id")));
});
