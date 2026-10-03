/*
 * Import lifecycle: create -> execute once -> poll -> the decision the gateway settled on.
 *
 * An import ends in a decision rather than a payload: `executeImport` answers 200 with
 * `decision` ALLOW, REDACT, REVIEW or BLOCK and the Run as data (shared/gateway/imports.ts). The
 * run state is `completed` for the first three and for a content BLOCK alike, so the decision —
 * not the state — is what the screen must report. Reading the state alone would show "Completed"
 * over an import that published nothing.
 *
 * The wording comes from `describeImportStatus`, which the Imports list already uses, so the
 * notice after an upload and the row it becomes say the same thing.
 */
import type { ApiResponse, Decision, Run } from "@/shared/contracts";
import { readRun } from "./chatData";
import {
  classifyResponse,
  classifyTerminalErrorCode,
  type GatewayOutcome,
  type OutcomeKind,
} from "./envelope";
import { describeImportStatus, type ImportStatus } from "./importStatus";
import { describeRun, isTerminalRunState } from "./runState";

/** A run of the kind this screen started, so it cannot poll a chat run into the upload card. */
export const readImportRun = (data: ApiResponse["data"]): Run | null => {
  const run = readRun(data);
  return run && run.kind === "import" ? run : null;
};

/** The four statuses an import can settle on; the other ImportStatus values are not terminal. */
type SettledStatus = Extract<ImportStatus, "approved" | "partial" | "review" | "blocked">;

/**
 * The import status each terminal decision corresponds to, from `imports.ts`:
 * every unit allowed -> approved; some allowed, some removed -> partial; any unit uncertain ->
 * review; nothing allowed -> blocked.
 */
const DECISION_STATUS: Partial<Record<Decision, SettledStatus>> = {
  ALLOW: "approved",
  REDACT: "partial",
  REVIEW: "review",
  BLOCK: "blocked",
};

const DECISION_KIND: Record<SettledStatus, OutcomeKind> = {
  approved: "result",
  partial: "result",
  review: "review",
  blocked: "denied",
};

/** `run` is the import run still in flight, or null once this response ended the lifecycle. */
export type ImportClassification = { outcome: GatewayOutcome; run: Run | null };

/**
 * Classify any import-lifecycle response: a terminal error code first, then a run still in flight
 * as progress, then a settled decision in import words, and everything else — a 415 for a PDF, a
 * 400 for an analyst outside their deal, a 503 — through the generic classifier, which carries the
 * server's own message.
 */
export function classifyImportResponse(status: number, body: ApiResponse | null): ImportClassification {
  const terminal = classifyTerminalErrorCode(body);
  if (terminal) return { outcome: terminal, run: null };

  const run = readImportRun(body?.data ?? null);
  const common = {
    reasons: body?.reasons ?? [],
    decision: body?.decision ?? null,
    errorCode: body?.error?.code ?? null,
    traceId: body?.trace_id ?? null,
    // Nothing is released to this screen either way: published excerpts are read back through the
    // import list and search, never returned by the import itself.
    showsResult: false,
    retryable: false,
  };

  if (run && !isTerminalRunState(run.state) && (status === 200 || status === 202)) {
    const described = describeRun(run);
    return {
      outcome: {
        ...common,
        kind: "progress",
        title: described.label,
        detail: described.detail,
        tone: "brand",
      },
      run,
    };
  }

  // A 200 with no decision is not a governed outcome, so it must fall through and fail closed
  // rather than default to any status here.
  const decision = body?.decision;
  const settled = status === 200 && decision ? DECISION_STATUS[decision] : undefined;
  if (settled) {
    const view = describeImportStatus(settled);
    return {
      outcome: {
        ...common,
        kind: DECISION_KIND[settled],
        title: view.label,
        detail: view.detail,
        tone: view.tone,
      },
      run: null,
    };
  }

  return { outcome: classifyResponse(status, body), run: null };
}
