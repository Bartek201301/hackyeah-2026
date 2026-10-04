// test:db — permission-filtered excerpt search/read and the access audit (T06 migration F) against the
// shared project. Manual, never CI. Needs the P05 corpus import: it fails loudly before any assertion
// when the seven fixture sources have no approved excerpts. Search and read are read-only; its only
// writes: reviewer access records labelled db_test (one operation, its intent/decision events and
// actor_activity row per run), which metrics and the audit export leave out. No cleanup deletes.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, fixtures, must } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const deal = (alias) => fixtures.deals.find((d) => d.alias === alias).id;
const S01 = "Brief me on AsterCloud revenue, forecast and bid ceiling. Cite sources.";
// RES-01 has been held in review since the P05 import (sensitive_exposure 0.3809) and S06 approval is not
// in this build, so it has only a candidate excerpt. Candidates must never be searchable or readable.
const CORPUS = ["PUB-01", "PUB-02", "INT-01", "INT-02", "RES-02", "OTH-01"];
const db = admin();
const actors = {};
let boreal;
let candidates;

before(async () => {
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  for (const { alias, email } of fixtures.accounts) actors[alias] = users.find((u) => u.email === email).id;

  // Source label = fixture alias (demo:seed); approved excerpts exist only after the real import.
  const sources = must(
    "corpus sources",
    await db.from("sources").select("id, label").eq("organisation_id", ORG).in("label", CORPUS),
  );
  const documents = sources.length
    ? must(
        "corpus documents",
        await db
          .from("documents")
          .select("id, source_id")
          .eq("organisation_id", ORG)
          .in(
            "source_id",
            sources.map((s) => s.id),
          ),
      )
    : [];
  const excerpts = documents.length
    ? must(
        "corpus excerpts",
        await db
          .from("excerpts")
          .select("id, document_id")
          .eq("organisation_id", ORG)
          .eq("status", "approved")
          .in(
            "document_id",
            documents.map((d) => d.id),
          ),
      )
    : [];
  const labelOf = (e) => {
    const sourceId = documents.find((d) => d.id === e.document_id).source_id;
    return sources.find((s) => s.id === sourceId).label;
  };
  const present = new Set(excerpts.map(labelOf));
  const missing = CORPUS.filter((label) => !present.has(label));
  if (missing.length)
    throw new Error(
      `Corpus missing: no approved excerpt for ${missing.join(", ")}. Run the P05 import first.`,
    );
  boreal = excerpts.filter((e) => labelOf(e) === "OTH-01").map((e) => e.id);
  candidates = must(
    "candidate excerpts",
    await db.from("excerpts").select("id").eq("organisation_id", ORG).eq("status", "candidate"),
  ).map((e) => e.id);
});

const search = (alias, { query = S01, audience = "actor", dealId = null } = {}) =>
  db.rpc("search_permitted_excerpts", {
    p_organisation_id: ORG,
    p_actor_id: actors[alias],
    p_audience: audience,
    p_query: query,
    p_limit: 20,
    p_deal_id: dealId,
  });
const rows = async (alias, options) => must(`search as ${alias}`, await search(alias, options));
const labels = (list) => new Set(list.map((r) => r.source_label));
const classes = (list) => new Set(list.map((r) => r.classification));
const includesAll = (set, wanted, who) =>
  wanted.forEach((label) => assert.ok(set.has(label), `${who} should see ${label}`));

test("the analyst sees PUB, INT and AsterCloud RES rows, never Boreal", async () => {
  const found = await rows("analyst");
  includesAll(labels(found), ["PUB-01", "INT-01", "INT-02", "RES-02"], "analyst");
  assert.ok(!labels(found).has("OTH-01"));
  assert.ok(found.every((r) => !boreal.includes(r.id)));
  assert.ok(
    found.every((r) => !candidates.includes(r.id)),
    "analyst search returned a candidate",
  );
  assert.ok(found.every((r) => !("deal_id" in r)));
});

test("the employee and the admin see public and internal rows only", async () => {
  for (const alias of ["employee", "admin"]) {
    const found = await rows(alias);
    includesAll(labels(found), ["PUB-01", "INT-01", "INT-02"], alias);
    assert.deepEqual([...classes(found)].sort(), ["internal", "public"], alias);
  }
});

test("the external reviewer, and any public-audience search, sees public rows only", async () => {
  const reviewer = await rows("reviewer");
  includesAll(labels(reviewer), ["PUB-01"], "reviewer");
  assert.deepEqual([...classes(reviewer)], ["public"]);
  const analystPublic = await rows("analyst", { audience: "public" });
  assert.deepEqual([...classes(analystPublic)], ["public"]);
  for (const { alias } of fixtures.accounts) {
    const externalScope = await rows(alias, { audience: "public" });
    assert.ok(
      externalScope.every((item) => item.classification === "public"),
      alias,
    );
  }
});

test("Boreal stays invisible even when searched by its own words", async () => {
  for (const { alias } of fixtures.accounts) {
    const found = await rows(alias, { query: "Boreal acquisition bid ceiling BOREAL-ONLY-910" });
    assert.ok(!labels(found).has("OTH-01"), alias);
  }
});

test("reading the OTH-01 excerpt by ID returns nothing for every account", async () => {
  for (const { alias } of fixtures.accounts) {
    const read = must(
      `read as ${alias}`,
      await db.rpc("read_permitted_excerpts", {
        p_organisation_id: ORG,
        p_actor_id: actors[alias],
        p_audience: "actor",
        p_ids: boreal,
      }),
    );
    assert.deepEqual(read, [], alias);
  }
  const held = await db.rpc("read_permitted_excerpts", {
    p_organisation_id: ORG,
    p_actor_id: actors.analyst,
    p_audience: "actor",
    p_ids: candidates,
  });
  assert.deepEqual(must("read candidates as analyst", held), []);
});

test("a deal the actor is not a member of is NOT_FOUND", async () => {
  for (const [alias, dealId] of [
    ["analyst", deal("BOREAL")],
    ["employee", deal("ASTER")],
    ["admin", deal("ASTER")],
  ]) {
    const { error } = await search(alias, { dealId });
    assert.equal(error?.message, "NOT_FOUND", alias);
  }
  const narrowed = await rows("analyst", { dealId: deal("ASTER") });
  includesAll(labels(narrowed), ["RES-02"], "analyst on ASTER");
  assert.ok(
    narrowed.every((r) => !candidates.includes(r.id)),
    "ASTER search returned a candidate",
  );
});

test("record_access_decision with the same key twice records one operation", async () => {
  const key = randomUUID();
  const args = {
    p_organisation_id: ORG,
    p_actor_id: actors.reviewer,
    p_operation: "db_test",
    p_idempotency_key: key,
    p_request_sha256: "h1",
    p_decision: "BLOCK",
    p_reasons: ["excerpt:unavailable"],
    // Contract-valid Usage and Assessment: the reviewer's activity list and trace must still render.
    p_usage: {
      generation_input_tokens: 0,
      generation_output_tokens: 0,
      generation_ms: 0,
      semantic_input_tokens: 0,
      semantic_ms: 0,
      reserved_generation_tokens: 0,
      unresolved_reservation: false,
      comparison_micro_usd: 0,
      comparison_rate_version: "none",
    },
    p_payload: {
      stage: "db_test",
      findings: [],
      semantic: {
        status: "not_required",
        scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
        checkpoint_revision: null,
        windows_planned: 0,
        windows_completed: 0,
        coverage_complete: false,
        text_sha256: null,
        coverage_ranges: [],
      },
    },
  };
  const first = must("record", await db.rpc("record_access_decision", args));
  const again = must("record replay", await db.rpc("record_access_decision", args));
  assert.equal(again.trace_id, first.trace_id);
  const ops = must(
    "operations",
    await db
      .from("operations")
      .select("state")
      .eq("organisation_id", ORG)
      .eq("actor_id", actors.reviewer)
      .eq("idempotency_key", key),
  );
  assert.deepEqual(ops, [{ state: "denied" }]);
  const { error } = await db.rpc("record_access_decision", { ...args, p_request_sha256: "h2" });
  assert.equal(error?.message, "CONFLICT");
});
