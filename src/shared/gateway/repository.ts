import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorCode } from "@/shared/contracts";
import { createSupabaseAdmin } from "@/shared/supabase/admin";
import { GatewayError, STATUS } from "./envelope";
import type { ActivityRow, DatasetBatch, EventRow, RepositoryPort, RunRecord, SourceRow } from "./ports";
import { sourceScope } from "./sources";

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

const RUN_COLUMNS =
  "id, kind, state, stage, policy_version, feed_version, input_private, result_private, lease_expires_at";

/** Gateway state over the run/operation RPCs. Server-only; every row is scoped to the trusted actor. */
export function createSupabaseRepository(db: SupabaseClient = createSupabaseAdmin()): RepositoryPort {
  return {
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
        .select(
          "trace_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version, created_at",
        )
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
          .order("id")
          .limit(201),
      );
      return { activity: row, events: events ?? [] };
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
    async loadDatasetBatch(actor, sourceId, batchId) {
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
          .order("row_number"),
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

    async storeQuarantine(key, bytes) {
      await data(
        db.storage.from("quarantine").upload(key, bytes, { contentType: "application/json", upsert: false }),
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
  };
}
