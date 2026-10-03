import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, Assessment, ConnectorImport, ErrorCode, Finding } from "@/shared/contracts";
import { clock, createCalls, loadControls, openRun, readOwnRun, Stop, TERMINAL } from "./calls";
import { decide, matchSensitive, matchSignatures, sha256Hex } from "./checks";
import { FIELDS, parseCsv, validRow, type NumberedRow, type Row } from "./csv";
import {
  envelope,
  errorOutcome,
  GatewayError,
  notExecutedUsage,
  SEMANTIC_NOT_REQUIRED,
  SEMANTIC_UNAVAILABLE,
} from "./envelope";
import { isUuid } from "./http";
import type {
  FinalOutcome,
  GatewayDeps,
  ImportPublication,
  ImportSource,
  Outcome,
  StartedRun,
  StoredResult,
} from "./ports";

// Connector import and CSV upload (technical-spec §4/§9, T05). Every non-blank line of every row is one
// unit — complete coverage, no truncation — checked by signatures and secret/contact patterns, then one
// Laya call, then `decide`. The document, its approved/candidate excerpts and review requests publish with
// the terminal run in one transaction (finalize_import); any service failure publishes nothing.

const INVALID_ROW = "A batch row does not match the dataset schema, so nothing was imported.";
const TOO_MANY_ROWS = "The batch has more rows than the import policy allows, so nothing was imported.";
const INVALID_CSV =
  "The CSV does not match the upload schema (header text,source_date,period,unit,fact_key,basis), so nothing was imported.";
const PDF_UNAVAILABLE = "PDF import is not available in this demo build; upload a CSV.";
const CSV_FIELDS =
  "CSV derives source_date, period, unit, fact_key and basis from each row; send only the file.";
const ANALYST_SCOPE = "Analyst uploads are restricted to the assigned deal.";
const PDF_FIELDS = ["source_date", "period", "unit", "fact_key", "basis"];
/** The import_upload multipart fields (openapi.json); the PDF metadata fields are refused for a CSV. */
export const UPLOAD_FIELDS = ["file", "classification", "deal_id", ...PDF_FIELDS] as const;
const CLASSIFICATIONS = new Set(["public", "internal", "restricted"]);

type Verdict = { decision: "ALLOW" | "REVIEW" | "BLOCK"; reasons: string[] };
type Unit = { locator: string; text: string; row: Row };
type Ending =
  | { decision: "ALLOW" | "REDACT" | "REVIEW" | "BLOCK"; reasons: string[] }
  | { error: ErrorCode; reasons?: string[]; message?: string };
/** runs.input_private of an upload; the raw file is already in quarantine under `storage_key`. */
type UploadInput = {
  source_id: string;
  document_id: string;
  storage_key: string;
  sha256: string;
  byte_count: number;
  format: "csv";
};

const isUpload = (input: unknown): input is UploadInput => {
  const i = input as Partial<UploadInput> | null;
  return (
    i?.format === "csv" &&
    [i.source_id, i.document_id, i.storage_key, i.sha256].every((v) => typeof v === "string") &&
    typeof i.byte_count === "number"
  );
};

/** Line units with stable locators; blank lines are dropped, nothing else is. */
const unitsOf = (rows: NumberedRow[]): Unit[] =>
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
  return accepted(deps, actor, run);
}

/** A replayed key returns the stored outcome; otherwise 202 with the pending Run. */
async function accepted(deps: GatewayDeps, actor: ActorContext, run: StartedRun): Promise<Outcome> {
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

/**
 * import_upload: admin (any deal) or analyst (assigned deal, restricted only) stages one CSV. The server
 * creates an unverified upload source; the raw bytes go to private quarantine; execute parses and checks.
 */
export async function startUpload(
  deps: GatewayDeps,
  actor: ActorContext,
  form: FormData,
  idempotencyKey: string,
): Promise<Outcome> {
  if (actor.role !== "admin" && actor.role !== "analyst") return errorOutcome("ACCESS_DENIED");
  const file = form.get("file");
  const classification = form.get("classification");
  const dealId = form.get("deal_id");
  if (
    !(file instanceof File) ||
    typeof classification !== "string" ||
    !CLASSIFICATIONS.has(classification) ||
    (dealId !== null && !(typeof dealId === "string" && isUuid(dealId)))
  )
    return errorOutcome("INVALID_INPUT");
  // deal_id narrows scope; it never grants it.
  if (actor.role === "analyst") {
    if (!dealId || !actor.deal_ids.includes(dealId)) return errorOutcome("NOT_FOUND");
    if (classification !== "restricted") return errorOutcome("INVALID_INPUT", { message: ANALYST_SCOPE });
  } else if (classification === "restricted" && !dealId) return errorOutcome("INVALID_INPUT");

  const controls = await loadControls(deps, actor);
  if (!controls) return errorOutcome("POLICY_UNAVAILABLE");
  if (file.size === 0) return errorOutcome("INVALID_INPUT");
  if (file.size > controls.policy.imports.max_bytes) return errorOutcome("INVALID_INPUT", { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Content decides the type; the file name and the declared MIME type are not trusted.
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-")
    return errorOutcome("UNSUPPORTED_FILE", { message: PDF_UNAVAILABLE });
  if (PDF_FIELDS.some((f) => form.has(f))) return errorOutcome("INVALID_INPUT", { message: CSV_FIELDS });
  try {
    if (new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("\0"))
      return errorOutcome("UNSUPPORTED_FILE");
  } catch {
    return errorOutcome("UNSUPPORTED_FILE");
  }

  const repo = deps.repository;
  const sha256 = sha256Hex(bytes);
  const label =
    file.name
      .replace(/[^A-Za-z0-9 ._-]/g, "")
      .trim()
      .slice(0, 100) || "upload.csv";
  const sourceId = await repo.createUploadSource({
    actor,
    label,
    classification: classification as ImportSource["classification"],
    dealId,
  });
  if (!sourceId) return errorOutcome("NOT_FOUND");
  const documentId = randomUUID();
  const storageKey = `${actor.organisation_id}/${documentId}/1.csv`;
  // ponytail: the source and object are written before the run, so a failed start (or a replayed key, which
  // answers the earlier run) leaves an unlinked source and quarantined object; cleanup is a T12 maintenance task.
  await repo.storeQuarantine(storageKey, bytes, "text/csv");
  const run = await repo.startRun({
    actor,
    operation: "import_upload",
    kind: "import",
    idempotencyKey,
    // Generated ids are left out so a retried request with the same key replays instead of conflicting.
    requestSha256: sha256Hex(JSON.stringify({ sha256, classification, deal_id: dealId })),
    traceId: randomUUID(),
    inputPrivate: {
      source_id: sourceId,
      document_id: documentId,
      storage_key: storageKey,
      sha256,
      byte_count: bytes.byteLength,
      format: "csv",
    },
  });
  return accepted(deps, actor, run);
}

export async function executeImport(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<Outcome> {
  // Re-checked on every request: the role comes from trusted membership, not from the stored run.
  if (actor.role !== "admin" && actor.role !== "analyst") return errorOutcome("ACCESS_DENIED");
  const t = clock();
  const repo = deps.repository;
  const opened = await openRun(deps, actor, runId, idempotencyKey, "import", t);
  if (opened.exit) return opened.exit;
  const { run, policy, feed, versions, op, lease } = opened;
  const upload = isUpload(run.input_private) ? run.input_private : null;

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
    let source: ImportSource;
    let rows: NumberedRow[];
    if (upload) {
      const found = await t.time("persistence_ms", () => repo.loadUploadSource(actor, upload.source_id));
      // An analyst keeps access only while the deal assignment that allowed the upload still holds.
      if (!found || (actor.role === "analyst" && !(found.deal_id && actor.deal_ids.includes(found.deal_id))))
        return { error: "NOT_FOUND" };
      source = found;
      const bytes = await t.time("persistence_ms", () => repo.readQuarantine(upload.storage_key));
      if (bytes.byteLength !== upload.byte_count || sha256Hex(bytes) !== upload.sha256)
        throw new GatewayError("STATE_UNAVAILABLE");
      const parsed = await t.time("deterministic_ms", () =>
        parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes), policy.imports),
      );
      if ("locator" in parsed) {
        findings.push({
          code: "invalid_csv",
          category: "import",
          severity: "block",
          stage,
          locator: parsed.locator,
        });
        return { error: "INVALID_INPUT", reasons: ["import:invalid_csv"], message: INVALID_CSV };
      }
      rows = parsed.rows;
    } else {
      // A connector import stays admin-only even for a run this actor started before a role change.
      if (actor.role !== "admin") return { error: "ACCESS_DENIED" };
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
      source = batch.source;
      rows = [];
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
    }
    if (await t.time("persistence_ms", () => repo.hasPublishedDocument(actor.organisation_id, source.id)))
      return { error: "CONFLICT" };

    // protocol v1 audiences; P10 may refine them.
    const audience = source.classification === "public" ? "public" : "actor";
    // Unverified audience evidence below restricted: a person decides before anything is searchable.
    const forceReview = source.audience_evidence === "unverified" && source.classification !== "restricted";
    // A key body spans lines with no marker of their own, so every line of a row holding a PEM block goes.
    const keyRows = new Map(
      rows.map(({ row }) => [
        row,
        matchSensitive(row.text, "import_signature").filter((f) => f.code === "PEM_KEY"),
      ]),
    );
    for (const unit of unitsOf(rows)) {
      stage = "import_signature";
      const found = await t.time("deterministic_ms", () => {
        const text = `${unit.text}\n${unit.row.period} ${unit.row.unit} ${unit.row.fact_key}`;
        const sensitive = matchSensitive(text, stage);
        if (!sensitive.some((f) => f.code === "PEM_KEY")) sensitive.push(...keyRows.get(unit.row)!);
        return [...matchSignatures(text, feed, stage), ...sensitive].map((f) => ({
          ...f,
          locator: unit.locator,
        }));
      });
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
    let original: Omit<ImportPublication["document"], "source_id" | "status">;
    if (upload) {
      const { document_id: id, storage_key, sha256, format, byte_count } = upload;
      original = { id, storage_key, sha256, format, byte_count };
    } else {
      // The private original: canonical JSON of the validated rows, under a server-generated key.
      const snapshot = JSON.stringify(
        rows.map(({ n: row_number, row }) => ({
          row_number,
          ...Object.fromEntries(FIELDS.map((f) => [f, row[f]])),
        })),
      );
      const bytes = Buffer.from(snapshot, "utf8");
      const id = randomUUID();
      const key = `${actor.organisation_id}/${id}/1.json`;
      await t.time("persistence_ms", () => repo.storeQuarantine(key, bytes, "application/json"));
      original = {
        id,
        storage_key: key,
        sha256: sha256Hex(snapshot),
        format: "dataset",
        byte_count: bytes.byteLength,
      };
    }
    const expiresAt = new Date(Date.now() + policy.retention.review_days * 86_400_000).toISOString();
    publication = {
      document: {
        id: original.id,
        source_id: source.id,
        status,
        storage_key: original.storage_key,
        sha256: original.sha256,
        format: original.format,
        byte_count: original.byte_count,
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
      operation: upload ? "import_upload" : "import_connector",
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
