import "server-only";
import type { ActorContext } from "@/shared/contracts";
import { readOwnRun } from "./calls";
import { executeChat } from "./chat";
import { executeAct } from "./client-act";
import { sha256Hex } from "./checks";
import { envelope, errorOutcome } from "./envelope";
import { executeExport } from "./exports";
import { executeImport } from "./imports";
import type { GatewayDeps, Outcome, StoredResult } from "./ports";

// run_execute / run_read dispatch by the stored run kind; each engine re-checks its own kind, so an
// import run never reaches the chat engine or the reverse.

export const readRunResult = (deps: GatewayDeps, actor: ActorContext, runId: string) =>
  readOwnRun(deps, actor, runId, ["chat", "import", "export"]);

export async function executeRun(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<Outcome> {
  const run = await deps.repository.readRun(actor, runId);
  // Act mode is a chat run marked in its private input; the act engine re-checks the mark.
  if (run?.kind === "chat" && (run.input_private as { mode?: unknown } | null)?.mode === "client_action")
    return executeAct(deps, actor, runId, idempotencyKey, signal);
  if (run?.kind === "chat") return executeChat(deps, actor, runId, idempotencyKey, signal);
  if (run?.kind === "import") return executeImport(deps, actor, runId, idempotencyKey, signal);
  if (run?.kind === "export") return executeExport(deps, actor, runId, idempotencyKey, signal);
  return errorOutcome("NOT_FOUND");
}

/**
 * run_cancel: own run only. pending → cancelled (GET then returns the stored 409 CANCELLED);
 * running → cancel_requested, and the execute stops before its next provider call. A run in any
 * other state is unchanged: 409 CONFLICT with its current state.
 */
export async function cancelRun(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  idempotencyKey: string,
): Promise<Outcome> {
  const { status, body } = errorOutcome("CANCELLED");
  const result: StoredResult = {
    status,
    decision: body.decision,
    reasons: body.reasons,
    semantic: body.semantic,
    usage: body.usage,
    data: body.data,
    error: body.error,
  };
  const run = await deps.repository.cancelRun({
    actor,
    runId,
    idempotencyKey,
    requestSha256: sha256Hex(runId),
    result,
  });
  const fields = { trace_id: runId, policy_version: run.policy_version, feed_version: run.feed_version };
  const data = { id: runId, kind: run.kind, state: run.state, stage: run.stage };
  if (!run.accepted) {
    const conflict = errorOutcome("CONFLICT", fields);
    return { status: conflict.status, body: { ...conflict.body, data } };
  }
  return { status: 200, body: envelope({ ...fields, data }) };
}
