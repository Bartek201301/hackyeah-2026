import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, Assessment, ConnectorImport, ErrorCode, Finding } from "@/shared/contracts";
import { clock, createCalls, openRun, readOwnRun, Stop, TERMINAL } from "./calls";
import { decide, matchSignatures, sha256Hex } from "./checks";
import {
  envelope,
  errorOutcome,
  GatewayError,
  notExecutedUsage,
  SEMANTIC_NOT_REQUIRED,
  SEMANTIC_UNAVAILABLE,
} from "./envelope";
import type { FinalOutcome, GatewayDeps, ImportPublication, Outcome, StoredResult } from "./ports";

// Connector import (technical-spec §4/§9, T05): admin only. Every non-blank line of every batch row is one
// unit — complete coverage, no truncation — checked by signatures, then one Laya call, then `decide`.
// The document, its approved/candidate excerpts and review requests publish with the terminal run in one
// transaction (finalize_import); any service failure publishes nothing.

const FIELDS = ["text", "source_date", "period", "unit", "fact_key", "basis"] as const;
const BASES = new Set(["actual", "forecast", "proposal", "event"]);
const INVALID_ROW = "A batch row does not match the dataset schema, so nothing was imported.";
const TOO_MANY_ROWS = "The batch has more rows than the import policy allows, so nothing was imported.";

type Row = Record<(typeof FIELDS)[number], string>;
type Verdict = { decision: "ALLOW" | "REVIEW" | "BLOCK"; reasons: string[] };
type Unit = { locator: string; text: string; row: Row };
type Ending =
  | { decision: "ALLOW" | "REDACT" | "REVIEW" | "BLOCK"; reasons: string[] }
  | { error: ErrorCode; reasons?: string[]; message?: string };

const isDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d);

/** The CSV schema: exactly the six fields, non-empty strings, an ISO date, a known basis, bounded text. */
function validRow(payload: unknown, maxChars: number): payload is Row {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  if (Object.keys(p).length !== FIELDS.length) return false;
  if (!FIELDS.every((f) => typeof p[f] === "string" && p[f].trim() !== "")) return false;
  const r = p as Row;
  return (
    isDate(r.source_date) &&
    BASES.has(r.basis) &&
    // Metadata is published beside the text but never semantically assessed, so it is held to short
    // closed shapes that cannot carry a sentence (FY2025 / 2026-Q4, USD million, bid_ceiling).
    /^[A-Za-z0-9-]{1,20}$/.test(r.period) &&
    /^[A-Za-z%$]{1,12}( [A-Za-z]{1,12})?$/.test(r.unit) &&
    /^[a-z0-9_]{1,40}$/.test(r.fact_key) &&
    [...r.text].length <= maxChars
  );
}

/** Line units with stable locators; blank lines are dropped, nothing else is. */
const unitsOf = (rows: { n: number; row: Row }[]): Unit[] =>
  rows.flatMap(({ n, row }) =>
    row.text
      .split("\n")
      .flatMap((line, i) =>
        line.trim() ? [{ locator: `row:${n}:line:${i + 1}`, text: line.trim(), row }] : [],
      ),
  );

const peak = (a: Assessment) => Math.max(...Object.values(a.scores).map((s) => s ?? 0));

export async function startConnectorImport(
  deps: GatewayDeps,
  actor: ActorContext,
  body: ConnectorImport,
  idempotencyKey: string,
): Promise<Outcome> {
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");
  const repo = deps.repository;
  // One body for a missing source, another organisation's source and an empty batch.
  if (!(await repo.loadDatasetBatch(actor, body.source_id, body.batch_id, 1)))
    return errorOutcome("NOT_FOUND");
  // ponytail: this runs before the key is looked up, so replaying the key of an import that already
  // published answers 409, not the stored Run. Look the key up first if a client ever relies on that replay.
  if (await repo.hasPublishedDocument(actor.organisation_id, body.source_id)) return errorOutcome("CONFLICT");
  const input = { source_id: body.source_id, batch_id: body.batch_id };
  const run = await repo.startRun({
    actor,
    operation: "import_connector",
    kind: "import",
    idempotencyKey,
    requestSha256: sha256Hex(JSON.stringify(input)),
    traceId: randomUUID(),
    inputPrivate: input,
  });
  if (TERMINAL.has(run.state)) return readOwnRun(deps, actor, run.run_id, ["import"]);
  return {
    status: 202,
    body: envelope({
      trace_id: run.run_id,
      policy_version: run.policy_version,
      feed_version: run.feed_version,
      data: { id: run.run_id, kind: run.kind, state: run.state, stage: run.stage },
    }),
  };
}

export async function executeImport(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<Outcome> {
  // Re-checked on every request: the role comes from trusted membership, not from the stored run.
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");
  const t = clock();
  const repo = deps.repository;
  const opened = await openRun(deps, actor, runId, idempotencyKey, "import", t);
  if (opened.exit) return opened.exit;
  const { run, policy, feed, versions, op, lease } = opened;

  // From here on every exit goes through finalize.
  const overall = AbortSignal.any([signal, AbortSignal.timeout(policy.execution.max_elapsed_ms)]);
  const usage = notExecutedUsage(policy.comparison_rate.version);
  const findings: Finding[] = [];
  const calls = createCalls({ deps, policy, op, usage, t, overall, findings });
  const outcomes: (Unit & Verdict)[] = [];
  let worst: Assessment | null = null;
  let publication: ImportPublication | null = null;
  let stage = "validate";
  const count = (d: Verdict["decision"]) => outcomes.filter((u) => u.decision === d).length;

  const pipeline = async (): Promise<Ending> => {
    const input = run.input_private as { source_id?: unknown; batch_id?: unknown } | null;
    const sourceId = input?.source_id;
    const batchId = input?.batch_id;
    if (typeof sourceId !== "string" || typeof batchId !== "string")
      throw new GatewayError("STATE_UNAVAILABLE");
    // One row past the cap is fetched so an oversized batch fails instead of being silently cut.
    const cap = policy.imports.max_csv_rows;
    const batch = await t.time("persistence_ms", () =>
      repo.loadDatasetBatch(actor, sourceId, batchId, cap + 1),
    );
    if (!batch) return { error: "NOT_FOUND" };
    if (batch.rows.length > cap)
      return { error: "INVALID_INPUT", reasons: ["import:too_many_rows"], message: TOO_MANY_ROWS };
    const { source } = batch;
    if (await t.time("persistence_ms", () => repo.hasPublishedDocument(actor.organisation_id, source.id)))
      return { error: "CONFLICT" };
    const rows: { n: number; row: Row }[] = [];
    for (const { row_number, payload } of batch.rows) {
      // One invalid row fails the whole run: no partial publication.
      if (!validRow(payload, policy.imports.max_text_chars)) {
        findings.push({
          code: "invalid_row",
          category: "import",
          severity: "block",
          stage,
          locator: `row:${row_number}`,
        });
        return { error: "INVALID_INPUT", reasons: ["import:invalid_row"], message: INVALID_ROW };
      }
      rows.push({ n: row_number, row: payload });
    }

    // protocol v1 audiences; P10 may refine them.
    const audience = source.classification === "public" ? "public" : "actor";
    // Unverified audience evidence below restricted: a person decides before anything is searchable.
    const forceReview = source.audience_evidence === "unverified" && source.classification !== "restricted";
    for (const unit of unitsOf(rows)) {
      stage = "import_signature";
      const found = await t.time("deterministic_ms", () =>
        matchSignatures(
          `${unit.text}\n${unit.row.period} ${unit.row.unit} ${unit.row.fact_key}`,
          feed,
          "import_signature",
        ).map((f) => ({ ...f, locator: unit.locator })),
      );
      findings.push(...found);
      let v: Verdict = await t.time("deterministic_ms", () => decide(found, null, policy));
      if (v.decision !== "BLOCK") {
        stage = "import_semantic";
        // A unit above one Laya window comes back incomplete → SEMANTIC_UNAVAILABLE for the run.
        const r = await calls.assess(unit.text, "import", { audience, locator: unit.locator });
        if (!worst || peak(r.semantic) > peak(worst)) worst = r.semantic;
        v = await t.time("deterministic_ms", () =>
          decide([...found, ...r.findings], r.semantic.scores, policy),
        );
      }
      if (v.decision === "ALLOW" && forceReview)
        v = { decision: "REVIEW", reasons: ["import:audience_unverified"] };
      outcomes.push({ ...unit, ...v });
    }

    stage = "publish";
    const [status, decision] = count("REVIEW")
      ? (["review", "REVIEW"] as const)
      : count("ALLOW") && !count("BLOCK")
        ? (["approved", "ALLOW"] as const)
        : count("ALLOW")
          ? (["partial", "REDACT"] as const)
          : (["blocked", "BLOCK"] as const);
    // The private original: canonical JSON of the validated rows, under a server-generated key.
    const snapshot = JSON.stringify(
      rows.map(({ n: row_number, row }) => ({
        row_number,
        ...Object.fromEntries(FIELDS.map((f) => [f, row[f]])),
      })),
    );
    const bytes = Buffer.from(snapshot, "utf8");
    const documentId = randomUUID();
    const storageKey = `${actor.organisation_id}/${documentId}/1.json`;
    await t.time("persistence_ms", () => repo.storeQuarantine(storageKey, bytes));
    const expiresAt = new Date(Date.now() + policy.retention.review_days * 86_400_000).toISOString();
    publication = {
      document: {
        id: documentId,
        source_id: source.id,
        status,
        storage_key: storageKey,
        sha256: sha256Hex(snapshot),
        format: "dataset",
        byte_count: bytes.byteLength,
      },
      excerpts: outcomes
        .filter((u) => u.decision !== "BLOCK")
        .map((u) => ({
          status: u.decision === "ALLOW" ? ("approved" as const) : ("candidate" as const),
          text: u.text,
          locator: u.locator,
          source_date: u.row.source_date,
          period: u.row.period,
          unit: u.row.unit,
          basis: u.row.basis,
          fact_key: u.row.fact_key,
        })),
      reviews: outcomes
        .filter((u) => u.decision === "REVIEW")
        .map((u) => ({ candidate_text: u.text, expires_at: expiresAt })),
    };
    stage = "done";
    return { decision, reasons: [...new Set(outcomes.flatMap((u) => u.reasons))].slice(0, 20) };
  };

  let end: Ending;
  let stateFailed = false;
  try {
    end = await pipeline();
  } catch (e) {
    if (e instanceof Stop) end = e.end;
    else {
      // Repository or storage error mid-pipeline: best-effort finalize as incomplete, nothing published.
      end = { error: "STATE_UNAVAILABLE" };
      stateFailed = true;
    }
  }
  if (calls.open) usage.unresolved_reservation = true;

  const common = { trace_id: run.id, ...versions, usage };
  let outcome: Outcome;
  let states: [FinalOutcome["run_state"], FinalOutcome["operation_state"]];
  if ("decision" in end) {
    // A content BLOCK is a governed import outcome, not an access denial: 200 with the Run as data.
    const state = end.decision === "REVIEW" ? "review" : "completed";
    outcome = {
      status: 200,
      body: envelope({
        ...common,
        semantic: worst ?? SEMANTIC_NOT_REQUIRED,
        decision: end.decision,
        reasons: end.reasons,
        data: { id: run.id, kind: "import", state, stage },
      }),
    };
    states = [state, "completed"];
  } else if (end.error === "BUDGET_EXHAUSTED") {
    outcome = errorOutcome("BUDGET_EXHAUSTED", {
      ...common,
      semantic: worst ?? SEMANTIC_NOT_REQUIRED,
      reasons: ["BUDGET_EXHAUSTED"],
    });
    states = ["blocked", "denied"];
  } else {
    outcome = errorOutcome(end.error, {
      ...common,
      reasons: end.reasons,
      message: end.message,
      semantic: end.error === "SEMANTIC_UNAVAILABLE" ? SEMANTIC_UNAVAILABLE : (worst ?? undefined),
    });
    states = calls.started || stateFailed ? ["incomplete", "unknown"] : ["failed", "completed"];
  }

  const counts = {
    units: outcomes.length,
    approved: count("ALLOW"),
    review: count("REVIEW"),
    removed: count("BLOCK"),
  };
  const settle = (o: Outcome, [run_state, operation_state]: typeof states) => {
    const { status, body } = o;
    const result: StoredResult = {
      status,
      decision: body.decision,
      reasons: body.reasons,
      semantic: body.semantic,
      usage: body.usage,
      data: body.data,
      error: body.error,
    };
    // Safe audit payload: per-unit findings with locators and counts, never unit text.
    const event = {
      stage,
      decision: body.decision,
      reasons: body.reasons,
      findings: findings.map((f) => ({
        code: f.code,
        category: f.category,
        severity: f.severity,
        stage: f.stage,
        locator: f.locator,
      })),
      counts,
      semantic: body.semantic,
      usage,
    };
    const outcome: FinalOutcome = {
      run_state,
      operation_state,
      operation: "import_connector",
      stage,
      decision: body.decision,
      reasons: body.reasons,
      usage,
      result,
      event,
    };
    return { runId: run.id, leaseToken: lease, operationId: op.operation_id, outcome };
  };
  const pub = "decision" in end ? publication : null;
  let finalized = false;
  try {
    finalized = await t.time("persistence_ms", () =>
      pub
        ? repo.finalizeImport({ ...settle(outcome, states), publication: pub })
        : repo.finalizeRun(settle(outcome, states)),
    );
  } catch (e) {
    if (pub) {
      // finalize_import rejected the publication and rolled all of it back (a concurrent import of the
      // same source, or a payload the RPC refuses): settle the run without it so it does not linger.
      outcome = errorOutcome(
        e instanceof GatewayError && e.code === "CONFLICT" ? "CONFLICT" : "STATE_UNAVAILABLE",
        {
          ...common,
          semantic: worst ?? undefined,
        },
      );
      const fallback = settle(outcome, ["failed", "completed"]);
      finalized = await t.time("persistence_ms", () => repo.finalizeRun(fallback)).catch(() => false);
    }
  }
  // Nothing is disclosed unless the publication, terminal result and audit committed together.
  const released = finalized ? outcome : errorOutcome("AUDIT_UNAVAILABLE", { ...common });
  return { status: released.status, body: { ...released.body, timings: t.timings() } };
}
