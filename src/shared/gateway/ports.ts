import type {
  ActorContext,
  ApiResponse,
  DetectionPort,
  GenerationPort,
  GatewayPolicy,
  Run,
  Usage,
} from "@/shared/contracts";

export type BudgetUnit = "generation_tokens" | "generation_ms" | "semantic_tokens" | "commercial_micro_usd";
/** Raw head snapshot; the engine validates policy/feed before use. */
export type Controls = {
  policy: unknown;
  feed: unknown;
  policy_version: number;
  feed_version: number;
  feed_expires_at: string;
};
export type PolicyWrite = {
  actor: ActorContext;
  idempotencyKey: string;
  expectedVersion: number;
  policy: GatewayPolicy;
  requestSha256: string;
  documentSha256: string;
};
export type RunRecord = {
  id: string;
  kind: Run["kind"];
  state: Run["state"];
  stage: string;
  policy_version: number;
  feed_version: number;
  input_private: unknown;
  result_private: unknown;
  lease_expires_at: string | null;
};
export type StartedRun = {
  run_id: string;
  kind: Run["kind"];
  state: Run["state"];
  stage: string;
  replay: boolean;
  policy_version: number;
  feed_version: number;
};
export type BegunOperation = {
  operation_id: string;
  state: string;
  replay: boolean;
  policy_version: number;
  feed_version: number;
};
/** What run_read/replay returns later; stored privately in runs.result_private. */
export type StoredResult = Pick<
  ApiResponse,
  "decision" | "reasons" | "semantic" | "usage" | "data" | "error"
> & {
  status: number;
};
export type FinalOutcome = {
  run_state: Run["state"];
  operation_state: "completed" | "denied" | "unknown";
  operation: string;
  stage: string;
  decision: ApiResponse["decision"];
  reasons: string[];
  usage: Usage;
  result: StoredResult | null;
  /** Safe audit payload: stage, decision, reasons, findings, semantic, usage. Never prompt or answer text. */
  event: Record<string, unknown>;
};
/** actor_activity row. jsonb and nullable versions are checked against AuditProjection before release. */
export type ActivityRow = {
  trace_id: string;
  actor_id: string;
  operation: string;
  state: string;
  decision: ApiResponse["decision"];
  reasons: string[];
  usage: Usage;
  policy_version: number | null;
  feed_version: number | null;
  created_at: string;
};
export type EventRow = { event_type: string; payload: Record<string, unknown>; created_at: string };
/** actor_activity row as selected for metrics: counters and settled usage, never events. */
export type MetricsActivityRow = {
  trace_id: string;
  decision: ApiResponse["decision"];
  reasons: string[];
  usage: Usage;
};
/** reservations row as selected for metrics; `state` decides settled against still outstanding.
 *  `charged` = reconciled conservatively: spent at the reserved amount, actual unknown. */
export type MetricsReservationRow = {
  unit: BudgetUnit;
  amount: number;
  state: "reserved" | "settled" | "unresolved" | "released" | "charged";
};
/** One reporting window; `ownActorId` null means the whole organisation. */
export type WindowQuery = {
  organisationId: string;
  ownActorId: string | null;
  from: string;
  to: string;
  limit: number;
};
/** sources row as selected for source_list; projected and schema-checked before release. */
export type SourceRow = { id: string; label: string; classification: string; kind: string };
/** The source an import publishes under; classification and deal are re-read in SQL at publication. */
export type ImportSource = {
  id: string;
  classification: "public" | "internal" | "restricted";
  audience_evidence: "verified" | "unverified";
};
/** run_id is nullable in the table: an upload document exists before its import run settles. */
export type ImportRow = { id: string; run_id: string | null; status: string; classification: string };
/** A registered dataset batch as loaded for import_connector; payloads are untrusted until validated. */
export type DatasetBatch = {
  source: ImportSource;
  rows: { row_number: number; payload: unknown }[];
};
/** finalize_import payload. Classification, deal and text hashes are derived in SQL, never sent. */
export type ImportPublication = {
  document: {
    id: string;
    source_id: string;
    status: "approved" | "partial" | "review" | "blocked";
    storage_key: string;
    sha256: string;
    format: string;
    byte_count: number;
  };
  excerpts: {
    status: "approved" | "candidate";
    text: string;
    locator: string;
    source_date: string;
    period: string;
    unit: string;
    basis: string;
    fact_key: string;
  }[];
  reviews: { candidate_text: string; expires_at: string }[];
};
/** 'actor' = the actor's own scope; 'public' = public rows only (export, judge connection). */
export type ExcerptAudience = "actor" | "public";
/** search/read_permitted_excerpts row: approved and visible to the actor; never deal_id or other rows. */
export type PermittedExcerpt = {
  id: string;
  version: number;
  text: string;
  classification: "public" | "internal" | "restricted";
  locator: string;
  source_date: string;
  period: string;
  unit: string;
  basis: "actual" | "forecast" | "proposal" | "event";
  fact_key: string | null;
  source_label: string;
};
/** Names follow protocols.md; startRun/readRun/claimRun are additions. Every method throws GatewayError
 *  carrying the RPC's ErrorCode, or STATE_UNAVAILABLE for anything else. */
export interface RepositoryPort {
  /** Active admin recheck, idempotency, immutable version, head CAS and audit in one transaction. */
  updatePolicy(
    input: PolicyWrite,
  ): Promise<{ trace_id: string; policy_version: number; feed_version: number }>;
  loadActivePolicyAndFeed(organisationId: string): Promise<Controls | null>;
  startRun(input: {
    actor: ActorContext;
    operation: string;
    kind: Run["kind"];
    idempotencyKey: string;
    requestSha256: string;
    traceId: string;
    inputPrivate: Record<string, unknown>;
  }): Promise<StartedRun>;
  beginOperation(input: {
    actor: ActorContext;
    operation: string;
    idempotencyKey: string;
    requestSha256: string;
    traceId: string;
    runId: string | null;
  }): Promise<BegunOperation>;
  /** Own runs only: organisation and actor must match. */
  readRun(actor: ActorContext, runId: string): Promise<RunRecord | null>;
  /** Returns the lease token, or null when the run is not pending. */
  claimRun(actor: ActorContext, runId: string, leaseMs: number): Promise<string | null>;
  reserveCall(input: {
    operationId: string;
    callId: string;
    provider: "laya" | "ollama";
    periodStart: string;
    units: { unit: BudgetUnit; amount: number; actor_limit: number; org_limit: number }[];
  }): Promise<void>;
  finishCall(
    callId: string,
    actuals: { unit: BudgetUnit; actual: number | null }[],
  ): Promise<{ settled: number; unresolved: number; overrun: boolean }>;
  /** Owner, or an admin of the same organisation; null otherwise. Events ordered, at most 201 (cap + 1). */
  readTrace(
    actor: ActorContext,
    traceId: string,
  ): Promise<{ activity: ActivityRow; events: EventRow[] } | null>;
  /**
   * cancel_run: own run only (NOT_FOUND otherwise). pending → cancelled with `result` stored;
   * running → cancel_requested. `accepted` is false when the run was in any other state, which is
   * returned unchanged. A replayed key returns the current state, accepted.
   */
  cancelRun(input: {
    actor: ActorContext;
    runId: string;
    idempotencyKey: string;
    requestSha256: string;
    result: StoredResult;
  }): Promise<{
    kind: Run["kind"];
    state: Run["state"];
    stage: string;
    policy_version: number;
    feed_version: number;
    accepted: boolean;
  }>;
  /** false = the run was already terminal (settle once). */
  finalizeRun(input: {
    runId: string;
    leaseToken: string;
    operationId: string;
    outcome: FinalOutcome;
  }): Promise<boolean>;
  /** Sources visible to this actor (sourceScope), newest first, at most `limit`. */
  listSources(actor: ActorContext, limit: number): Promise<SourceRow[]>;
  /** A dataset source of the actor's organisation with at most `limit` batch rows by row number; null
   *  when the source is missing, not a dataset, or the batch is empty. */
  loadDatasetBatch(
    actor: ActorContext,
    sourceId: string,
    batchId: string,
    limit: number,
  ): Promise<DatasetBatch | null>;
  /** The source has an approved or partial document (re-import is refused). */
  hasPublishedDocument(organisationId: string, sourceId: string): Promise<boolean>;
  /** Private quarantine bucket, server-generated key, never overwrites. */
  storeQuarantine(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The quarantined original; throws when it is missing. Server-side only, never a browser URL. */
  readQuarantine(key: string): Promise<Uint8Array>;
  /** A new upload source (audience evidence unverified, created by the actor); null when `dealId` is
   *  not a deal of the actor's organisation. */
  createUploadSource(input: {
    actor: ActorContext;
    label: string;
    classification: ImportSource["classification"];
    dealId: string | null;
  }): Promise<string | null>;
  /** An upload source of the actor's organisation, or null. */
  loadUploadSource(
    actor: ActorContext,
    sourceId: string,
  ): Promise<(ImportSource & { deal_id: string | null }) | null>;
  /** finalize_run plus the publication in one transaction; false/CONFLICT = nothing was inserted. */
  finalizeImport(input: {
    runId: string;
    leaseToken: string;
    operationId: string;
    outcome: FinalOutcome;
    publication: ImportPublication;
  }): Promise<boolean>;
  /**
   * One page of an actor's own activity, newest first, at most `limit`. `after` is a trace id the
   * actor may see; null means the first page. Returns null when the cursor is not one of theirs,
   * so an unreachable cursor cannot confirm that the trace exists.
   */
  listActivity(input: {
    organisationId: string;
    actorId: string;
    after: string | null;
    limit: number;
  }): Promise<ActivityRow[] | null>;
  /**
   * Rows behind one metrics window: activity for the counters and settled usage, reservations for
   * what is still outstanding. Filtering is in the query because the gateway client bypasses RLS;
   * `ownActorId` null means the whole organisation. At most `limit` rows of each.
   */
  readMetricsRows(
    input: WindowQuery,
  ): Promise<{ activity: MetricsActivityRow[]; reservations: MetricsReservationRow[] }>;
  /** Activity rows of one window for the audit CSV, newest first, at most `limit`. */
  exportActivity(input: WindowQuery): Promise<ActivityRow[]>;
  /** Imports visible to this actor (importScope), newest first, at most `limit`. */
  listImports(actor: ActorContext, limit: number): Promise<ImportRow[]>;
  /**
   * Approved excerpts matching `query`, best first, at most min(limit, 20). Permissions are derived in
   * SQL from the actor's membership and deal memberships; never pass a role or deals. `dealId` only
   * narrows restricted rows and throws NOT_FOUND unless it is one of the actor's deals.
   */
  searchPermittedExcerpts(
    actor: ActorContext,
    input: { query: string; dealId: string | null; audience: ExcerptAudience; limit: number },
  ): Promise<PermittedExcerpt[]>;
  /**
   * The same SQL permission filter by ID (at most 20); never pass a role or deals. Only permitted IDs
   * come back, so a missing and a forbidden excerpt look identical.
   */
  readPermittedExcerpts(
    actor: ActorContext,
    audience: ExcerptAudience,
    ids: string[],
  ): Promise<PermittedExcerpt[]>;
  /**
   * One audited access operation (excerpt search/read, admin review reads): operation, intent and
   * decision events and the actor_activity row in one transaction; membership is checked in SQL.
   * A null key is a fresh access; the same key and hash return the existing trace, another hash is
   * CONFLICT. `event` is the decision payload: `stage` (required), findings, semantic and counts only,
   * never query or excerpt text.
   */
  recordAccessDecision(input: {
    actor: ActorContext;
    operation: string;
    idempotencyKey: string | null;
    requestSha256: string;
    decision: "ALLOW" | "BLOCK";
    reasons: string[];
    usage: Usage;
    event: Record<string, unknown> & { stage: string };
  }): Promise<{ trace_id: string; policy_version: number; feed_version: number }>;
  /** Review requests of the organisation, pending first, then newest, at most `limit`. */
  listReviews(organisationId: string, limit: number): Promise<ReviewRow[]>;
  /** One review request of the organisation, or null when the id is not one of its own. */
  readReview(organisationId: string, id: string): Promise<ReviewRow | null>;
}
/** review_requests row for the admin review reads; candidate_text is private review content. */
export type ReviewRow = {
  id: string;
  version: number;
  candidate_text: string;
  classification: "public" | "internal" | "restricted";
  status: "pending" | "approved" | "rejected" | "expired";
  document_id: string;
};
/** null = adapter not composed → 503 before any reservation, never ALLOW. */
export type GatewayDeps = {
  repository: RepositoryPort;
  detection: DetectionPort | null;
  generation: GenerationPort | null;
};
export type Outcome = { status: number; body: ApiResponse };
