// test:db — finalize_import against the shared project (T05 migration E). Manual, never CI.
// Its only writes: reviewer import runs labelled db_test_run/db_test_execute with their audit events and
// actor_activity rows (operation db_test); one synthetic upload source "db_test synthetic (BOREAL)", reused
// across reruns, restricted to the BOREAL deal that no demo account belongs to; review-status documents
// under it with their excerpts (which inherit restricted/BOREAL) and review requests, which are expired
// after the run so the admin queue stays clean. No reservations, no Storage objects, no deletes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { admin, fixtures, must } from "./clients.mjs";

const ORG = fixtures.organisation.id;
const BOREAL = fixtures.deals.find((deal) => deal.alias === "BOREAL").id;
const LABEL = "db_test synthetic (BOREAL)";
const db = admin();
const runs = [];
let reviewer;
let source;

before(async () => {
  const { email } = fixtures.accounts.find((account) => account.alias === "reviewer");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  reviewer = users.find((user) => user.email === email).id;
  const existing = must(
    "find source",
    await db.from("sources").select("id").eq("organisation_id", ORG).eq("label", LABEL).maybeSingle(),
  );
  source =
    existing?.id ??
    must(
      "create source",
      await db
        .from("sources")
        .insert({
          organisation_id: ORG,
          label: LABEL,
          kind: "upload",
          classification: "restricted",
          deal_id: BOREAL,
          audience_evidence: "verified",
          created_by: reviewer,
        })
        .select("id")
        .single(),
    ).id;
});

after(async () => {
  if (!runs.length) return;
  must(
    "expire test reviews",
    await db
      .from("review_requests")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .in("run_id", runs)
      .eq("status", "pending"),
  );
});

const rpc = async (name, args) => must(name, await db.rpc(name, args));
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** A started import run claimed with a lease, plus its execute operation, as run_execute does it. */
async function claimedImport(sourceId) {
  const run = await rpc("start_run", {
    p_organisation_id: ORG,
    p_actor_id: reviewer,
    p_operation: "db_test_run",
    p_kind: "import",
    p_idempotency_key: randomUUID(),
    p_request_sha256: "h1",
    p_trace_id: randomUUID(),
    p_input_private: { source_id: sourceId, batch_id: randomUUID() },
  });
  runs.push(run.run_id);
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
  return { runId: run.run_id, lease, operationId: op.operation_id };
}

const outcome = {
  run_state: "review",
  operation_state: "completed",
  decision: "REVIEW",
  reasons: ["semantic:sensitive_exposure"],
  usage: { semantic_ms: 0, unresolved_reservation: false },
  operation: "db_test",
  stage: "done",
  result: { status: 200, decision: "REVIEW" },
  event: { stage: "done", counts: { units: 2, approved: 1, review: 1, removed: 0 } },
};
const excerpt = (status, text, locator) => ({
  status,
  text,
  locator,
  source_date: "2026-09-29",
  period: "2026-Q4",
  unit: "USD million",
  basis: "proposal",
  fact_key: "db_test",
  // Ignored by the RPC: classification and deal always come from the source row.
  classification: "public",
  deal_id: null,
});
function publication(sourceId) {
  const id = randomUUID();
  const marker = randomUUID();
  return {
    marker,
    p_document: {
      id,
      source_id: sourceId,
      status: "review",
      storage_key: `${ORG}/${id}/1.json`,
      sha256: sha256(marker),
      format: "dataset",
      byte_count: 64,
      classification: "public",
    },
    p_excerpts: [
      excerpt("approved", `Synthetic db_test line one ${marker}.`, "row:1:line:1"),
      excerpt("candidate", `Synthetic db_test line two ${marker}.`, "row:1:line:2"),
    ],
    p_reviews: [
      {
        candidate_text: `Synthetic db_test line two ${marker}.`,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      },
    ],
  };
}
const finalize = (claim, pub) =>
  db.rpc("finalize_import", {
    p_run_id: claim.runId,
    p_lease_token: claim.lease,
    p_operation_id: claim.operationId,
    p_outcome: outcome,
    p_document: pub.p_document,
    p_excerpts: pub.p_excerpts,
    p_reviews: pub.p_reviews,
  });
const counts = async (runId) => ({
  documents: must("count documents", await db.from("documents").select("id").eq("run_id", runId)).length,
  reviews: must("count reviews", await db.from("review_requests").select("id").eq("run_id", runId)).length,
  sourceDocuments: must(
    "count source documents",
    await db.from("documents").select("id").eq("source_id", source),
  ).length,
});

let published;

test("finalize_import publishes the document, excerpts and reviews and settles the run", async () => {
  const claim = await claimedImport(source);
  const pub = publication(source);
  const result = must("finalize_import", await finalize(claim, pub));
  assert.deepEqual(result, { finalized: true, state: "review", document_id: pub.p_document.id });
  published = { claim, pub };

  const doc = must(
    "document",
    await db
      .from("documents")
      .select("status, uploaded_by, run_id, version, format, byte_count")
      .eq("id", pub.p_document.id)
      .single(),
  );
  assert.deepEqual(doc, {
    status: "review",
    uploaded_by: reviewer,
    run_id: claim.runId,
    version: 1,
    format: "dataset",
    byte_count: 64,
  });
  const excerpts = must(
    "excerpts",
    await db
      .from("excerpts")
      .select("status, locator, text, text_sha256, approval_reason, approved_by, version")
      .eq("document_id", pub.p_document.id)
      .order("locator"),
  );
  assert.deepEqual(
    excerpts.map((e) => [
      e.status,
      e.locator,
      e.text_sha256 === sha256(e.text),
      e.approval_reason,
      e.approved_by,
    ]),
    [
      ["approved", "row:1:line:1", true, "import:assessment_clean", null],
      ["candidate", "row:1:line:2", true, null, null],
    ],
  );
  const reviews = must(
    "reviews",
    await db.from("review_requests").select("status, version, document_id").eq("run_id", claim.runId),
  );
  assert.deepEqual(reviews, [{ status: "pending", version: 1, document_id: pub.p_document.id }]);
  const run = must(
    "run",
    await db.from("runs").select("state, stage, lease_token").eq("id", claim.runId).single(),
  );
  assert.deepEqual(run, { state: "review", stage: "done", lease_token: null });
  const activity = must(
    "activity",
    await db.from("actor_activity").select("decision, operation").eq("trace_id", claim.runId).single(),
  );
  assert.deepEqual(activity, { decision: "REVIEW", operation: "db_test" });
});

test("payload classification and deal are ignored in favour of the source row", async () => {
  assert.ok(published, "depends on the first test");
  const doc = must(
    "document",
    await db
      .from("documents")
      .select("classification, deal_id")
      .eq("id", published.pub.p_document.id)
      .single(),
  );
  assert.deepEqual(doc, { classification: "restricted", deal_id: BOREAL });
  const excerpts = must(
    "excerpts",
    await db
      .from("excerpts")
      .select("classification, deal_id")
      .eq("document_id", published.pub.p_document.id),
  );
  assert.deepEqual(excerpts, [
    { classification: "restricted", deal_id: BOREAL },
    { classification: "restricted", deal_id: BOREAL },
  ]);
  const reviews = must(
    "reviews",
    await db.from("review_requests").select("classification").eq("run_id", published.claim.runId),
  );
  assert.deepEqual(reviews, [{ classification: "restricted" }]);
});

test("a second finalize_import on the same run conflicts and inserts nothing", async () => {
  assert.ok(published, "depends on the first test");
  const before = await counts(published.claim.runId);
  const again = publication(source);
  const { error } = await finalize(published.claim, again);
  assert.equal(error?.message, "CONFLICT");
  assert.deepEqual(await counts(published.claim.runId), before);
  assert.equal(
    must("no document", await db.from("documents").select("id").eq("id", again.p_document.id)).length,
    0,
  );
});

test("a source outside the run organisation is NOT_FOUND and inserts nothing", async () => {
  // A random id takes the same organisation-filtered lookup as another organisation's source; the
  // composite foreign keys make a real cross-org row unreachable from this organisation's run.
  const outside = randomUUID();
  const claim = await claimedImport(outside);
  const pub = publication(outside);
  const { error } = await finalize(claim, pub);
  assert.equal(error?.message, "NOT_FOUND");
  assert.equal((await counts(claim.runId)).documents, 0);
  // Settle the throwaway run so it does not linger as running.
  const settled = await rpc("finalize_run", {
    p_run_id: claim.runId,
    p_lease_token: claim.lease,
    p_operation_id: claim.operationId,
    p_outcome: {
      ...outcome,
      run_state: "failed",
      decision: null,
      reasons: [],
      result: null,
      event: { stage: "validate" },
    },
  });
  assert.equal(settled.finalized, true);
});
