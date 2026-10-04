import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/shared/contracts";
import { createSupabaseAdmin } from "@/shared/supabase/admin";
import { GatewayError, STATUS } from "./envelope";
import type { ClientRow } from "./client-rules";
import type {
  ActivityRow,
  DatasetBatch,
  EventRow,
  ExportRow,
  ImportRow,
  MetricsActivityRow,
  MetricsReservationRow,
  PermittedExcerpt,
  RepositoryPort,
  ReviewRow,
  RunRecord,
  SourceRow,
  WindowQuery,
} from "./ports";
import { importScope, sourceScope } from "./sources";

const CODES = new Set<string>(Object.keys(STATUS));

/**
 * The RPCs raise an ErrorCode as the message; anything else (network, 22P02, permission) is
 * STATE_UNAVAILABLE. Database details, hints and codes are never forwarded.
 */
async function data<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  let result;
  try {
    result = await query;
  } catch {
    throw new GatewayError("STATE_UNAVAILABLE");
  }
  if (result.error) {
    const { message } = result.error;
    throw new GatewayError(CODES.has(message) ? (message as ErrorCode) : "STATE_UNAVAILABLE");
  }
  return result.data;
}

/** Every column of a ReviewRow; candidate_text is private review content, admin-only. */
const REVIEW_COLUMNS = "id, version, candidate_text, classification, status, document_id";

/** Every editor column of a client; visibleClient narrows it per role before release. */
const CLIENT_COLUMNS = "id, name, sector, notes, annual_fee_usd, status, version, created_at";

const RUN_COLUMNS =
  "id, kind, state, stage, policy_version, feed_version, input_private, result_private, lease_expires_at";

/** Every column of an ActivityRow. */
const ACTIVITY_COLUMNS =
  "trace_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version, created_at";

/** Gateway state over the run/operation RPCs. Server-only; every row is scoped to the trusted actor. */
export function createSupabaseRepository(db: SupabaseClient = createSupabaseAdmin()): RepositoryPort {
  /** actor_activity inside one window, newest first; shared by metrics and the audit export. */
  async function windowActivity<Row>(
    columns: string,
    { organisationId, ownActorId, from, to, limit }: WindowQuery,
  ): Promise<Row[]> {
    let query = db
      .from("actor_activity")
      .select(columns)
      .eq("organisation_id", organisationId)
      // scripts/db/run.test.mjs writes db_test rows with partial usage; they are not root requests.
      .neq("operation", "db_test")
      .gte("created_at", from)
      .lte("created_at", to);
    // own scope filters here, not after serialization: the admin client bypasses RLS. Tested against
    // null, not truthiness: a falsy identifier would drop the filter and widen the read silently.
    if (ownActorId !== null) query = query.eq("actor_id", ownActorId);
    const rows = await data<Row[] | null>(
      query
        .order("created_at", { ascending: false })
        .order("trace_id", { ascending: false })
        .limit(limit)
        .overrideTypes<Row[], { merge: false }>(),
    );
    return rows ?? [];
  }

  return {
    async updatePolicy({ actor, idempotencyKey, expectedVersion, policy, requestSha256, documentSha256 }) {
      return data(
        db.rpc("update_policy", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_idempotency_key: idempotencyKey,
          p_expected_version: expectedVersion,
          p_document: policy,
          p_request_sha256: requestSha256,
          p_document_sha256: documentSha256,
        }),
      );
    },
    async loadActivePolicyAndFeed(organisationId) {
      const head = await data(
        db
          .from("control_heads")
          .select("policy_version, feed_version")
          .eq("organisation_id", organisationId)
          .maybeSingle(),
      );
      if (!head) return null;
      const [policy, feed] = await Promise.all([
        data(
          db
            .from("policy_versions")
            .select("document")
            .eq("organisation_id", organisationId)
            .eq("version", head.policy_version)
            .maybeSingle(),
        ),
        data(
          db
            .from("feed_versions")
            .select("document, expires_at")
            .eq("organisation_id", organisationId)
            .eq("version", head.feed_version)
            .maybeSingle(),
        ),
      ]);
      if (!policy || !feed) return null;
      return {
        policy: policy.document,
        feed: feed.document,
        policy_version: head.policy_version,
        feed_version: head.feed_version,
        feed_expires_at: feed.expires_at,
      };
    },

    async startRun({ actor, operation, kind, idempotencyKey, requestSha256, traceId, inputPrivate }) {
      const run = await data(
        db.rpc("start_run", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_operation: operation,
          p_kind: kind,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_trace_id: traceId,
          p_input_private: inputPrivate,
        }),
      );
      return {
        run_id: run.run_id,
        kind: run.kind,
        state: run.state,
        stage: run.stage,
        replay: run.replay,
        policy_version: run.policy_version,
        feed_version: run.feed_version,
      };
    },

    async beginOperation({ actor, operation, idempotencyKey, requestSha256, traceId, runId }) {
      const op = await data(
        db.rpc("begin_operation", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_operation: operation,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_trace_id: traceId,
          p_run_id: runId,
        }),
      );
      return {
        operation_id: op.operation_id,
        state: op.state,
        replay: op.replay,
        policy_version: op.policy_version,
        feed_version: op.feed_version,
      };
    },

    async finalizeGuardCheck({
      operationId,
      actor,
      tokenId,
      scope,
      decision,
      reasons,
      usage,
      event,
      unknown,
    }) {
      return data(
        db.rpc("finalize_guard_check", {
          p_operation_id: operationId,
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_token_id: tokenId,
          p_scope: scope,
          p_decision: decision,
          p_reasons: reasons,
          p_usage: usage,
          p_payload: event,
          p_unknown: unknown,
        }),
      );
    },

    async readGuardResult(actor, operationId) {
      const intent = await data<{ trace_id: string } | null>(
        db
          .from("audit_events")
          .select("trace_id")
          .eq("organisation_id", actor.organisation_id)
          .eq("actor_id", actor.actor_id)
          .eq("operation_id", operationId)
          .eq("event_type", "intent")
          .maybeSingle(),
      );
      if (!intent) return null;
      return data(
        db
          .from("actor_activity")
          .select("trace_id, decision, reasons, usage, policy_version, feed_version")
          .eq("trace_id", intent.trace_id)
          .eq("organisation_id", actor.organisation_id)
          .eq("actor_id", actor.actor_id)
          .maybeSingle(),
      );
    },

    async readRun(actor, runId) {
      return data<RunRecord | null>(
        db
          .from("runs")
          .select(RUN_COLUMNS)
          .eq("id", runId)
          .eq("organisation_id", actor.organisation_id)
          .eq("actor_id", actor.actor_id)
          .maybeSingle(),
      );
    },

    // One conditional UPDATE is atomic: only a pending run can be claimed, by exactly one caller.
    async claimRun(actor, runId, leaseMs) {
      const token = randomUUID();
      const rows = await data(
        db
          .from("runs")
          .update({
            state: "running",
            stage: "checking",
            lease_token: token,
            lease_expires_at: new Date(Date.now() + leaseMs).toISOString(),
          })
          .eq("id", runId)
          .eq("organisation_id", actor.organisation_id)
          .eq("actor_id", actor.actor_id)
          .eq("state", "pending")
          .select("id"),
      );
      return rows?.length === 1 ? token : null;
    },

    async reserveCall({ operationId, callId, provider, periodStart, units }) {
      await data(
        db.rpc("reserve_call", {
          p_operation_id: operationId,
          p_call_id: callId,
          p_provider: provider,
          p_period_start: periodStart,
          p_units: units,
        }),
      );
    },

    async finishCall(callId, actuals) {
      const result = await data(db.rpc("finish_call", { p_call_id: callId, p_actuals: actuals }));
      return { settled: result.settled, unresolved: result.unresolved, overrun: result.overrun };
    },

    // Organisation first on both queries; the actor filter is dropped only for an admin of that organisation.
    async readTrace(actor, traceId) {
      let activity = db
        .from("actor_activity")
        .select(ACTIVITY_COLUMNS)
        .eq("trace_id", traceId)
        .eq("organisation_id", actor.organisation_id);
      if (actor.role !== "admin") activity = activity.eq("actor_id", actor.actor_id);
      const row = await data<ActivityRow | null>(activity.maybeSingle());
      if (!row) return null;
      const events = await data<EventRow[] | null>(
        db
          .from("audit_events")
          .select("event_type, payload, created_at")
          .eq("trace_id", traceId)
          .eq("organisation_id", actor.organisation_id)
          .order("created_at")
          // One transaction writes intent and decision with the same timestamp (cancel_run,
          // record_access_decision); the enum's declaration order puts intent first.
          .order("event_type")
          .order("id")
          .limit(201),
      );
      return { activity: row, events: events ?? [] };
    },

    async cancelRun({ actor, runId, idempotencyKey, requestSha256, result }) {
      const run = await data(
        db.rpc("cancel_run", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_run_id: runId,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_result: result,
        }),
      );
      return {
        kind: run.kind,
        state: run.state,
        stage: run.stage,
        policy_version: run.policy_version,
        feed_version: run.feed_version,
        accepted: run.accepted === true,
      };
    },

    async finalizeRun({ runId, leaseToken, operationId, outcome }) {
      const result = await data(
        db.rpc("finalize_run", {
          p_run_id: runId,
          p_lease_token: leaseToken,
          p_operation_id: operationId,
          p_outcome: outcome,
        }),
      );
      return result.finalized === true;
    },

    // Organisation and visibility both filter in the query: this client bypasses RLS, so a row the
    // actor may not see must never be fetched, not merely dropped afterwards.
    async listSources(actor, limit) {
      const { classifications, dealIds } = sourceScope(actor);
      let query = db
        .from("sources")
        .select("id, label, classification, kind")
        .eq("organisation_id", actor.organisation_id);
      query =
        dealIds.length > 0
          ? query.or(
              `classification.in.(${classifications.join(",")}),` +
                `and(classification.eq.restricted,deal_id.in.(${dealIds.join(",")}))`,
            )
          : query.in("classification", classifications);
      const rows = await data<SourceRow[] | null>(
        query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
      );
      return rows ?? [];
    },

    // Organisation and kind filter in the query; the batch is read only for a source that passed both.
    async loadDatasetBatch(actor, sourceId, batchId, limit) {
      const source = await data<DatasetBatch["source"] | null>(
        db
          .from("sources")
          .select("id, classification, audience_evidence")
          .eq("id", sourceId)
          .eq("organisation_id", actor.organisation_id)
          .eq("kind", "dataset")
          .maybeSingle(),
      );
      if (!source) return null;
      const rows = await data<DatasetBatch["rows"] | null>(
        db
          .from("dataset_rows")
          .select("row_number, payload")
          .eq("organisation_id", actor.organisation_id)
          .eq("source_id", source.id)
          .eq("batch_id", batchId)
          .order("row_number")
          .limit(limit),
      );
      return rows?.length ? { source, rows } : null;
    },

    async hasPublishedDocument(organisationId, sourceId) {
      const rows = await data<{ id: string }[] | null>(
        db
          .from("documents")
          .select("id")
          .eq("organisation_id", organisationId)
          .eq("source_id", sourceId)
          .in("status", ["approved", "partial"])
          .limit(1),
      );
      return (rows?.length ?? 0) > 0;
    },

    async storeQuarantine(key, bytes, contentType) {
      await data(db.storage.from("quarantine").upload(key, bytes, { contentType, upsert: false }));
    },

    async readQuarantine(key) {
      const blob = await data(db.storage.from("quarantine").download(key));
      if (!blob) throw new GatewayError("STATE_UNAVAILABLE");
      return new Uint8Array(await blob.arrayBuffer());
    },

    // The deal must belong to the actor's organisation; the insert would otherwise fail on its foreign key.
    async createUploadSource({ actor, label, classification, dealId }) {
      if (dealId) {
        const deal = await data<{ id: string } | null>(
          db
            .from("deals")
            .select("id")
            .eq("id", dealId)
            .eq("organisation_id", actor.organisation_id)
            .maybeSingle(),
        );
        if (!deal) return null;
      }
      const row = await data<{ id: string } | null>(
        db
          .from("sources")
          .insert({
            organisation_id: actor.organisation_id,
            label,
            kind: "upload",
            classification,
            deal_id: dealId,
            created_by: actor.actor_id,
            audience_evidence: "unverified",
          })
          .select("id")
          .single(),
      );
      if (!row) throw new GatewayError("STATE_UNAVAILABLE");
      return row.id;
    },

    async loadUploadSource(actor, sourceId) {
      return data(
        db
          .from("sources")
          .select("id, classification, audience_evidence, deal_id")
          .eq("id", sourceId)
          .eq("organisation_id", actor.organisation_id)
          .eq("kind", "upload")
          .maybeSingle(),
      );
    },

    async finalizeImport({ runId, leaseToken, operationId, outcome, publication }) {
      const result = await data(
        db.rpc("finalize_import", {
          p_run_id: runId,
          p_lease_token: leaseToken,
          p_operation_id: operationId,
          p_outcome: outcome,
          p_document: publication.document,
          p_excerpts: publication.excerpts,
          p_reviews: publication.reviews,
        }),
      );
      return result.finalized === true;
    },

    async storeExport(key, bytes) {
      await data(
        db.storage
          .from("generated-exports")
          .upload(key, bytes, { contentType: "application/pdf", upsert: false }),
      );
    },

    async finalizeExport({ runId, leaseToken, operationId, outcome, publication }) {
      const result = await data(
        db.rpc("finalize_export", {
          p_run_id: runId,
          p_lease_token: leaseToken,
          p_operation_id: operationId,
          p_outcome: outcome,
          p_export: publication,
        }),
      );
      return result.finalized === true;
    },

    async readExport(actor, id) {
      return data<ExportRow | null>(
        db
          .from("exports")
          .select("id, run_id, storage_key, expires_at, status, excerpt_versions")
          .eq("id", id)
          // Owner only, filtered here because the admin client bypasses RLS.
          .eq("organisation_id", actor.organisation_id)
          .eq("actor_id", actor.actor_id)
          .maybeSingle(),
      );
    },

    async readExportFile(key) {
      const blob = await data(db.storage.from("generated-exports").download(key));
      if (!blob) throw new GatewayError("STATE_UNAVAILABLE");
      return new Uint8Array(await blob.arrayBuffer());
    },

    async listActivity({ organisationId, actorId, after, limit }) {
      const scoped = () =>
        db
          .from("actor_activity")
          .select(ACTIVITY_COLUMNS)
          .eq("organisation_id", organisationId)
          // Own activity only, filtered here because the admin client bypasses RLS.
          .eq("actor_id", actorId);

      let query = scoped();
      if (after) {
        // The cursor is resolved inside the actor's own rows, so a trace belonging to someone else
        // is simply not found and reads as an invalid cursor.
        const cursor = await data<{ created_at: string } | null>(
          scoped().eq("trace_id", after).maybeSingle(),
        );
        if (!cursor) return null;
        /*
         * Keyset on the published order (created_at, id) descending; trace_id is the primary key.
         *
         * Both values are double-quoted inside the filter. A timestamptz renders with `+` and `:`,
         * which are significant in PostgREST's `or` grammar, so an unquoted value would change the
         * filter's shape rather than its operand. `after` is already a verified uuid and the
         * timestamp comes from a row this actor may see, but the quoting is what makes that
         * irrelevant.
         */
        const at = `"${cursor.created_at}"`;
        query = query.or(`created_at.lt.${at},and(created_at.eq.${at},trace_id.lt."${after}")`);
      }

      const rows = await data<ActivityRow[] | null>(
        query.order("created_at", { ascending: false }).order("trace_id", { ascending: false }).limit(limit),
      );
      return rows ?? [];
    },

    async readMetricsRows({ organisationId, ownActorId, from, to, limit }) {
      const activity = await windowActivity<MetricsActivityRow>("trace_id, decision, reasons, usage", {
        organisationId,
        ownActorId,
        from,
        to,
        limit,
      });

      /*
       * Reservations carry no actor, so the window and the scope come from their operation. The
       * embedded columns exist to filter the join and are never read: only unit, amount and state
       * reach the aggregate, so the nested object cannot reach a response.
       */
      let reservationQuery = db
        .from("reservations")
        .select("unit, amount, state, operations!inner(actor_id, created_at)")
        .eq("organisation_id", organisationId)
        .gte("operations.created_at", from)
        .lte("operations.created_at", to);
      if (ownActorId !== null) {
        reservationQuery = reservationQuery.eq("operations.actor_id", ownActorId);
      }
      const reservations = await data<MetricsReservationRow[] | null>(reservationQuery.limit(limit));

      return { activity, reservations: reservations ?? [] };
    },

    exportActivity(input) {
      return windowActivity<ActivityRow>(ACTIVITY_COLUMNS, input);
    },

    async listImports(actor, limit) {
      const { uploadedBy } = importScope(actor);
      let query = db
        .from("documents")
        .select("id, run_id, status, classification")
        .eq("organisation_id", actor.organisation_id)
        // Settled imports only, so the 50-item cap is spent on rows that have an outcome.
        .not("run_id", "is", null);
      if (uploadedBy) query = query.eq("uploaded_by", uploadedBy);
      const rows = await data<ImportRow[] | null>(
        query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
      );
      return rows ?? [];
    },

    // Permissions derived in SQL from trusted memberships; only the actor's identity is passed.
    async searchPermittedExcerpts(actor, { query, dealId, audience, limit }) {
      const rows = await data<PermittedExcerpt[] | null>(
        db.rpc("search_permitted_excerpts", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_audience: audience,
          p_query: query,
          p_limit: limit,
          p_deal_id: dealId,
        }),
      );
      return rows ?? [];
    },

    async readPermittedExcerpts(actor, audience, ids) {
      const rows = await data<PermittedExcerpt[] | null>(
        db.rpc("read_permitted_excerpts", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_audience: audience,
          p_ids: ids,
        }),
      );
      return rows ?? [];
    },

    async recordAccessDecision({
      actor,
      operation,
      idempotencyKey,
      requestSha256,
      decision,
      reasons,
      usage,
      event,
    }) {
      const result = await data(
        db.rpc("record_access_decision", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_operation: operation,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_decision: decision,
          p_reasons: reasons,
          p_usage: usage,
          p_payload: event,
        }),
      );
      return {
        trace_id: result.trace_id,
        policy_version: result.policy_version,
        feed_version: result.feed_version,
      };
    },

    async listReviews(organisationId, limit) {
      const rows = await data<ReviewRow[] | null>(
        db
          .from("review_requests")
          .select(REVIEW_COLUMNS)
          .eq("organisation_id", organisationId)
          // `review_status` is declared ('pending', 'approved', 'rejected', 'expired'), and Postgres
          // orders an enum by declaration, so ascending status is the work queue: pending first.
          .order("status", { ascending: true })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit),
      );
      return rows ?? [];
    },

    async readReview(organisationId, id) {
      // maybeSingle: another organisation's id is simply absent here, which the engine turns into
      // the same 404 as an id that does not exist.
      const row = await data<ReviewRow | null>(
        db
          .from("review_requests")
          .select(REVIEW_COLUMNS)
          .eq("organisation_id", organisationId)
          .eq("id", id)
          .maybeSingle(),
      );
      return row ?? null;
    },

    async listClients(organisationId, limit) {
      const rows = await data<ClientRow[] | null>(
        db
          .from("clients")
          .select(CLIENT_COLUMNS)
          // Filtered here because the admin client bypasses RLS.
          .eq("organisation_id", organisationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit),
      );
      return rows ?? [];
    },

    async readClient(organisationId, id) {
      // Another organisation's id is absent here, so it is the same 404 as one that never existed.
      const row = await data<ClientRow | null>(
        db
          .from("clients")
          .select(CLIENT_COLUMNS)
          .eq("organisation_id", organisationId)
          .eq("id", id)
          .maybeSingle(),
      );
      return row ?? null;
    },

    createClient({ actor, idempotencyKey, requestSha256, client }) {
      return data(
        db.rpc("create_client", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_client: client,
        }),
      );
    },

    async recordClientReview({ actor, operation, idempotencyKey, requestSha256, reasons, clientId, fields }) {
      const result = await data(
        db.rpc("record_client_review", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_operation: operation,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_reasons: reasons,
          p_client_id: clientId,
          p_fields: fields,
        }),
      );
      return {
        trace_id: result.trace_id,
        policy_version: result.policy_version,
        feed_version: result.feed_version,
      };
    },

    updateClient({ actor, idempotencyKey, requestSha256, clientId, expectedVersion, changes }) {
      return data(
        db.rpc("update_client", {
          p_organisation_id: actor.organisation_id,
          p_actor_id: actor.actor_id,
          p_idempotency_key: idempotencyKey,
          p_request_sha256: requestSha256,
          p_client_id: clientId,
          p_expected_version: expectedVersion,
          p_changes: changes,
        }),
      );
    },
  };
}
