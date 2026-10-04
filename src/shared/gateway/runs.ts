import "server-only";
import type { ActorContext } from "@/shared/contracts";
import { readOwnRun } from "./calls";
import { executeChat } from "./chat";
import { errorOutcome } from "./envelope";
import { executeExport } from "./exports";
import { executeImport } from "./imports";
import type { GatewayDeps, Outcome } from "./ports";

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
  if (run?.kind === "chat") return executeChat(deps, actor, runId, idempotencyKey, signal);
  if (run?.kind === "import") return executeImport(deps, actor, runId, idempotencyKey, signal);
  if (run?.kind === "export") return executeExport(deps, actor, runId, idempotencyKey, signal);
  return errorOutcome("NOT_FOUND");
}
