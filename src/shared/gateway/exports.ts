import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, ExportRequest } from "@/shared/contracts";
import { type AnswerSpec, executeAnswer, startAnswer, SYSTEM_PROMPT } from "./chat";
import { sha256Hex } from "./checks";
import { errorOutcome, GatewayError, notExecutedUsage, STATUS } from "./envelope";
import { isUuid } from "./http";
import { renderPdf } from "./pdf";
import type { GatewayDeps, Outcome } from "./ports";

/*
 * export_start / export run / export_download (technical-spec §7).
 *
 * The export is the chat engine with audience public for every role: public excerpts only in search,
 * Laya and the access recheck, no contextual verification, and no reuse of an earlier answer or context.
 * After every check passed, a fresh PDF of the checked text is stored privately under a server key and
 * finalize_export writes the exports row with the terminal run; only then is the download path released.
 *
 * The download is the owner's only, ready and unexpired, its cited versions still approved and public,
 * and every attempt is an audited access decision. A guessed, foreign, expired or revoked id is the same
 * 404, and a denied attempt records no id. Bytes are streamed by the gateway; no Storage URL exists.
 */

export const EXPORT_PROMPT = `${SYSTEM_PROMPT} This summary is for a public audience.`;
export const downloadPath = (id: string) => `/api/v1/exports/${id}/download`;

const exportSpec = (deps: GatewayDeps, actor: ActorContext): AnswerSpec => ({
  kind: "export",
  operation: "export_start",
  field: "topic",
  audience: "public",
  prompt: EXPORT_PROMPT,
  verify: false,
  async publish({ policy, answer, citations }) {
    const id = randomUUID();
    const now = new Date();
    const { bytes, text } = await renderPdf(answer, citations, now);
    const storageKey = `${actor.organisation_id}/${id}.pdf`;
    await deps.repository.storeExport(storageKey, bytes);
    const expiresAt = new Date(now.getTime() + policy.retention.export_minutes * 60_000).toISOString();
    return {
      data: { download_path: downloadPath(id), expires_at: expiresAt },
      publication: {
        id,
        storage_key: storageKey,
        text_sha256: sha256Hex(text),
        expires_at: expiresAt,
        excerpt_versions: citations.map((c) => ({ excerpt_id: c.excerpt_id, version: c.excerpt_version })),
      },
    };
  },
});

export const startExport = (deps: GatewayDeps, actor: ActorContext, body: ExportRequest, key: string) =>
  startAnswer(deps, actor, exportSpec(deps, actor), body.topic, body.deal_id, key);

export const executeExport = (
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  key: string,
  signal: AbortSignal,
) => executeAnswer(deps, actor, runId, key, signal, exportSpec(deps, actor));

export async function downloadExport(
  deps: GatewayDeps,
  actor: ActorContext,
  id: string,
  now = Date.now(),
): Promise<Outcome | Response> {
  const repo = deps.repository;
  const row = isUuid(id) ? await repo.readExport(actor, id) : null;
  let bytes: Uint8Array | null = null;
  // ponytail: expiry is enforced here only; the row stays 'ready' (no sweeper), T12 maintenance purges it.
  if (row?.status === "ready" && Date.parse(row.expires_at) > now) {
    // Current access: a version revoked or re-classified since generation withdraws the file.
    const cited = row.excerpt_versions;
    const still = cited.length
      ? await repo.readPermittedExcerpts(
          actor,
          "public",
          cited.map((v) => v.excerpt_id),
        )
      : [];
    const ok = cited.every((v) => still.some((e) => e.id === v.excerpt_id && e.version === v.version));
    if (ok) bytes = await repo.readExportFile(row.storage_key);
  }

  let recorded;
  try {
    recorded = await repo.recordAccessDecision({
      actor,
      operation: "export_download",
      idempotencyKey: null,
      requestSha256: sha256Hex(id),
      decision: bytes ? "ALLOW" : "BLOCK",
      reasons: bytes ? [] : ["export:unavailable"],
      usage: notExecutedUsage(),
      // A denied attempt carries no id: the audit trail must not confirm that one exists.
      event: bytes ? { stage: "access", export_id: id, run_id: row!.run_id } : { stage: "access" },
    });
  } catch (error) {
    const decided = error instanceof GatewayError && STATUS[error.code] < 500;
    return errorOutcome(decided ? error.code : "AUDIT_UNAVAILABLE");
  }
  const versions = { policy_version: recorded.policy_version, feed_version: recorded.feed_version };
  if (!bytes) return errorOutcome("NOT_FOUND", { trace_id: recorded.trace_id, ...versions });
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="public-summary.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Trace-ID": recorded.trace_id,
    },
  });
}
