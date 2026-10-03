/*
 * Chat response classification across the whole run lifecycle.
 *
 * `classifyResponse` alone is not enough here. protocols.md says `run_execute` and `run_read`
 * return "Run while pending/running", and a pending run carries `decision: null` by contract — so a
 * perfectly normal in-progress poll looks exactly like a 200 with no decision, which the generic
 * classifier (correctly) fails closed on. Without this module every poll before completion would
 * render as a service failure.
 *
 * Order of precedence, strictest first:
 *   1. a terminal error code (CANCELLED / INCOMPLETE) in the envelope;
 *   2. a run that is still in flight  -> progress, never a result;
 *   3. a run that ended without releasing -> that state's own outcome;
 *   4. anything else -> the generic status classifier, which still fails closed.
 *
 * A completed chat arrives as `{answer, citations}` with a releasing decision, so it falls through
 * to step 4 and is gated by `decision` exactly as before. Nothing here can turn a null decision
 * into a released answer.
 */
import type { ApiResponse, Run } from "@/shared/contracts";
import {
  classifyResponse,
  classifyTerminalErrorCode,
  type GatewayOutcome,
  type OutcomeKind,
} from "./envelope";
import { readChatRun } from "./chatData";
import { describeRun, isTerminalRunState, progressLabel } from "./runState";

/** Terminal run states that withhold output, and the outcome kind each maps to. */
const WITHHELD: Partial<Record<Run["state"], OutcomeKind>> = {
  review: "review",
  blocked: "denied",
  failed: "failed",
  cancelled: "cancelled",
  incomplete: "incomplete",
};

const fromRun = (body: ApiResponse | null, run: Run, kind: OutcomeKind): GatewayOutcome => {
  const described = describeRun(run);
  return {
    kind,
    title: described.label,
    detail: described.detail,
    tone: described.tone,
    showsResult: false,
    retryable: false,
    reasons: body?.reasons ?? [],
    decision: body?.decision ?? null,
    errorCode: body?.error?.code ?? null,
    traceId: body?.trace_id ?? null,
  };
};

export type ChatClassification = {
  outcome: GatewayOutcome;
  /**
   * The chat run still in flight, or null once this response ended the lifecycle. The screen uses
   * it to poll, to offer Cancel and to show "Running checks", and all three must stop together —
   * a terminal response that carries no run of its own would otherwise leave them live.
   */
  run: Run | null;
};

/**
 * Classify any chat-lifecycle response: create, execute or poll.
 *
 * `status` is the HTTP status, `body` the parsed envelope. Both come from `readEnvelope` in
 * @/shared/contracts/client, which handles the 2xx/non-2xx split and fails closed on a non-envelope.
 */
export function classifyChatResponse(status: number, body: ApiResponse | null): ChatClassification {
  const run = readChatRun(body?.data ?? null);

  // 1. A terminal error code outranks everything, including a run that still looks alive.
  const terminal = classifyTerminalErrorCode(body);
  if (terminal) return { outcome: terminal, run: null };

  if (run && (status === 200 || status === 202)) {
    // 2. Still working. Report the server's own stage; release nothing.
    if (!isTerminalRunState(run.state)) {
      const described = describeRun(run);
      return {
        outcome: {
          ...fromRun(body, run, "progress"),
          title: progressLabel(run),
          detail: described.detail,
          tone: "brand",
        },
        run,
      };
    }

    // 3. Ended without releasing anything.
    const withheldKind = WITHHELD[run.state];
    if (withheldKind) return { outcome: fromRun(body, run, withheldKind), run: null };
  }

  // 4. Everything else, including a completed `{answer, citations}` payload, is gated by decision.
  return { outcome: classifyResponse(status, body), run: null };
}
