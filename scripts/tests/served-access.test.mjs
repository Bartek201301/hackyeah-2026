import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ORG = "11111111-1111-4111-8111-111111111111";
const ANALYST = "22222222-2222-4222-8222-222222222222";
const EXTERNAL = "33333333-3333-4333-8333-333333333333";
const ASTER = "44444444-4444-4444-8444-444444444444";
const BOREAL = "55555555-5555-4555-8555-555555555555";
const S1 = "66666666-6666-4666-8666-666666666661";
const S2 = "66666666-6666-4666-8666-666666666662";
const S3 = "66666666-6666-4666-8666-666666666663";
const D1 = "77777777-7777-4777-8777-777777777771";
const D2 = "77777777-7777-4777-8777-777777777772";
const D3 = "77777777-7777-4777-8777-777777777773";
const E1 = "88888888-8888-4888-8888-888888888881";
const E2 = "88888888-8888-4888-8888-888888888882";
const E3 = "88888888-8888-4888-8888-888888888883";

const setup = `
create role anon; create role authenticated; create role service_role;
create type public.member_role as enum ('admin','analyst','employee','external');
create type public.classification as enum ('public','internal','restricted');
create type public.excerpt_status as enum ('candidate','approved','rejected','revoked');
create type public.fact_basis as enum ('actual','forecast','proposal','event');
create table public.memberships (organisation_id uuid, actor_id uuid, role public.member_role, active boolean);
create table public.deal_memberships (organisation_id uuid, actor_id uuid, deal_id uuid);
create table public.sources (id uuid, organisation_id uuid, label text, dataset_key text, created_at timestamptz);
create table public.documents (id uuid, organisation_id uuid, source_id uuid);
create table public.excerpts (id uuid, organisation_id uuid, document_id uuid, status public.excerpt_status,
  version int, text text, classification public.classification, locator text, source_date date,
  period text, unit text, basis public.fact_basis, fact_key text, deal_id uuid,
  search_vector tsvector generated always as (to_tsvector('english', text)) stored, created_at timestamptz);
insert into public.memberships values
  ('${ORG}','${ANALYST}','analyst',true), ('${ORG}','${EXTERNAL}','external',true);
insert into public.deal_memberships values ('${ORG}','${ANALYST}','${ASTER}');
insert into public.sources values
  ('${S1}','${ORG}','MIX-01.csv',null,now()),
  ('${S2}','${ORG}','MIX-01.csv',null,now()),
  ('${S3}','${ORG}','Boreal plan.pdf',null,now());
insert into public.documents values
  ('${D1}','${ORG}','${S1}'), ('${D2}','${ORG}','${S2}'), ('${D3}','${ORG}','${S3}');
insert into public.excerpts
(id,organisation_id,document_id,status,version,text,classification,locator,source_date,period,unit,basis,fact_key,deal_id,created_at)
values
('${E1}','${ORG}','${D1}','candidate',1,'AsterCloud forecast is USD 164 million.','restricted','row:1','2026-10-04','FY2026','USD million','forecast','revenue','${ASTER}',now()),
('${E2}','${ORG}','${D2}','approved',1,'AsterCloud bid ceiling is USD 640 million.','restricted','row:1','2026-10-04','FY2026','USD million','proposal','bid_ceiling','${ASTER}',now()),
('${E3}','${ORG}','${D3}','approved',1,'Boreal bid ceiling is USD 910 million.','restricted','row:1','2026-10-04','FY2026','USD million','proposal','bid_ceiling','${BOREAL}',now());
`;

test("served excerpt SQL filters source names and candidate text before ranking", async () => {
  const db = new PGlite();
  try {
    await db.exec(setup);
    await db.exec(
      readFileSync(
        new URL("../../supabase/migrations/20261004034500_served_excerpt_access.sql", import.meta.url),
        "utf8",
      ),
    );
    const match = (actor, name) =>
      db.query("select * from public.match_permitted_sources($1,$2,$3,$4,$5,$6)", [
        ORG,
        actor,
        "actor",
        name,
        null,
        null,
      ]);
    const matches = (await match(ANALYST, "MIX-01.csv")).rows;
    assert.equal(matches.length, 2);
    assert.ok(matches.every((r) => r.label === "MIX-01.csv"));
    assert.equal((await match(ANALYST, "mix01")).rows.length, 2);
    assert.deepEqual((await match(ANALYST, "Boreal plan.pdf")).rows, []);
    assert.deepEqual((await match(EXTERNAL, "MIX-01.csv")).rows, []);
    const selected = (
      await db.query("select id,status,text from public.search_served_excerpts($1,$2,$3,$4,$5,$6,$7)", [
        ORG,
        ANALYST,
        "actor",
        "forecast",
        5,
        null,
        S1,
      ])
    ).rows;
    assert.deepEqual(
      selected.map((r) => [r.id, r.status]),
      [[E1, "candidate"]],
    );
    const all = (
      await db.query("select id from public.search_served_excerpts($1,$2,$3,$4,$5,$6,$7)", [
        ORG,
        ANALYST,
        "actor",
        "bid forecast",
        5,
        null,
        null,
      ])
    ).rows.map((r) => r.id);
    assert.ok(all.includes(E1) && all.includes(E2));
    assert.ok(!all.includes(E3));
    const publicRead = (
      await db.query("select id from public.read_served_excerpts($1,$2,$3,$4)", [
        ORG,
        ANALYST,
        "public",
        [E1, E2],
      ])
    ).rows;
    assert.deepEqual(publicRead, []);
    await db.exec("set role anon");
    await assert.rejects(match(ANALYST, "MIX-01.csv"), /permission denied/i);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("blocked imports may retain private candidates but cannot publish approved text", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create type public.document_status as enum ('approved','partial','review','blocked');
      create type public.excerpt_status as enum ('approved','candidate');
      create type public.classification as enum ('public','internal','restricted');
      create type public.fact_basis as enum ('actual','forecast','proposal','event');
      create table public.runs(id uuid, kind text, state text, lease_token uuid,
        input_private jsonb, organisation_id uuid, actor_id uuid);
      create table public.sources(id uuid, organisation_id uuid, deal_id uuid,
        classification public.classification);
      create table public.documents(id uuid, organisation_id uuid, source_id uuid, uploaded_by uuid,
        deal_id uuid, classification public.classification, status public.document_status,
        storage_key text, sha256 text, format text, byte_count bigint, version int, run_id uuid);
      create table public.excerpts(organisation_id uuid, document_id uuid, version int, text text,
        text_sha256 text, classification public.classification, deal_id uuid,
        status public.excerpt_status, locator text, source_date date, period text,
        unit text, basis public.fact_basis, fact_key text, approved_by uuid, approval_reason text);
      create table public.review_requests(organisation_id uuid, document_id uuid, run_id uuid,
        candidate_text text, version int, classification public.classification, expires_at timestamptz);
      create function public.finalize_run(uuid,uuid,uuid,jsonb) returns jsonb language sql as
        'select ''{"finalized":true,"state":"completed"}''::jsonb';
      insert into public.runs values
        ('${E1}','import','running','${E2}','{"source_id":"${S1}"}','${ORG}','${ANALYST}');
      insert into public.sources values ('${S1}','${ORG}',null,'internal');
    `);
    await db.exec(
      readFileSync(
        new URL("../../supabase/migrations/20261004034600_retain_private_candidates.sql", import.meta.url),
        "utf8",
      ),
    );
    const document = {
      id: D1,
      source_id: S1,
      status: "blocked",
      sha256: "a".repeat(64),
      format: "csv",
      storage_key: `${ORG}/${D1}/1.csv`,
      byte_count: 12,
    };
    const excerpt = {
      status: "candidate",
      text: "Forecast is USD 164 million.",
      locator: "row:1",
      source_date: "2026-10-04",
      period: "FY2026",
      unit: "USD million",
      basis: "forecast",
      fact_key: "revenue",
    };
    const invoke = (status) =>
      db.query("select public.finalize_import($1,$2,$3,$4,$5,$6,$7)", [
        E1,
        E2,
        E3,
        { run_state: "completed", decision: "BLOCK" },
        document,
        [{ ...excerpt, status }],
        [],
      ]);
    const result = (await invoke("candidate")).rows[0].finalize_import;
    assert.equal(result.finalized, true);
    const stored = (await db.query("select status,text from public.excerpts")).rows;
    assert.deepEqual(stored, [{ status: "candidate", text: excerpt.text }]);
    assert.deepEqual((await db.query("select status from public.documents")).rows, [{ status: "blocked" }]);
    await assert.rejects(invoke("approved"), (error) => error.message === "INVALID_INPUT");
  } finally {
    await db.close();
  }
});
