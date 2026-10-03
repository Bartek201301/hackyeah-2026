/*
 * Run lifecycle: when to stop polling, and what is safe to say while a run is in flight.
 *
 * docs/contracts/protocols.md: "stop on terminal state, poll at 1-second intervals while the screen
 * is visible". The server's `stage` string is displayed verbatim — the UI never invents stage names,
 * because an invented stage would misdescribe what the gateway actually did.
 */
import type { Run } from "@/shared/contracts";
import type { OutcomeTone } from "./envelope";

export type RunState = Run["state"];

/** Protocol poll interval. Not a tunable: the contract fixes it. */
export const POLL_INTERVAL_MS = 1000;

/**
 * States after which no further poll is useful.
 * `cancel_requested` is deliberately absent — cancellation is requested, not yet confirmed, so the
 * run must keep being observed until the server settles it.
 */
const TERMINAL: ReadonlySet<RunState> = new Set<RunState>([
  "completed",
  "review",
  "blocked",
  "failed",
  "cancelled",
  "incomplete",
]);

export function isTerminalRunState(state: RunState): boolean {
  return TERMINAL.has(state);
}

export function shouldKeepPolling(run: Pick<Run, "state"> | null): boolean {
  return run !== null && !isTerminalRunState(run.state);
}

/** Cancellation may only be offered while work can still be stopped. */
export function canCancel(run: Pick<Run, "state"> | null): boolean {
  return run !== null && (run.state === "pending" || run.state === "running");
}

/**
 * Did a cancel request reach a decision?
 *
 * protocols.md: a 503 carries no decision. The gateway did not record a cancellation, so the run is
 * exactly as it was and must keep being observed. Treating that response as the run's own outcome
 * would replace a live run with a service error it never had — and `run_cancel` is still the 503
 * seam, so today every cancel takes this path.
 */
export function cancelReachedDecision(status: number): boolean {
  return status !== 503;
}

/** Said next to the Cancel button, not in the outcome notice: the run itself is unaffected. */
export const CANCEL_UNAVAILABLE =
  "Cancellation is unavailable, so the run was not stopped. The gateway is still checking it.";

export type RunDescription = {
  label: string;
  detail: string;
  tone: OutcomeTone;
  /** True only for `completed`. Every other state withholds the result. */
  showsResult: boolean;
  busy: boolean;
};

const DESCRIPTIONS: Record<RunState, Omit<RunDescription, "detail">> = {
  pending: { label: "Queued", tone: "neutral", showsResult: false, busy: true },
  running: { label: "Running checks", tone: "brand", showsResult: false, busy: true },
  cancel_requested: { label: "Cancelling", tone: "neutral", showsResult: false, busy: true },
  completed: { label: "Completed", tone: "success", showsResult: true, busy: false },
  review: { label: "Held for review", tone: "warning", showsResult: false, busy: false },
  blocked: { label: "Blocked", tone: "danger", showsResult: false, busy: false },
  failed: { label: "Failed", tone: "danger", showsResult: false, busy: false },
  cancelled: { label: "Cancelled", tone: "neutral", showsResult: false, busy: false },
  incomplete: { label: "Incomplete", tone: "warning", showsResult: false, busy: false },
};

const DETAILS: Record<RunState, string> = {
  pending: "The gateway has recorded the request and has not started work yet.",
  running: "Identity, policy, content and budget checks are in progress.",
  cancel_requested: "Cancellation was requested. Waiting for the gateway to confirm it.",
  completed: "Checks finished and the result was released.",
  review: "Content is held for administrator review. It is not released to you.",
  blocked: "The control policy refused this request.",
  failed: "The run did not finish. Nothing was released.",
  cancelled: "The run was stopped. Nothing was released.",
  incomplete: "Checks did not complete, so nothing is released. Recorded usage may be uncertain.",
};

export function describeRun(run: Pick<Run, "state" | "stage">): RunDescription {
  return { ...DESCRIPTIONS[run.state], detail: DETAILS[run.state] };
}

/**
 * Safe progress line. Uses the server `stage` when present, otherwise the state label alone.
 * Returns a plain string so the component has no formatting decisions to make.
 */
export function progressLabel(run: Pick<Run, "state" | "stage">): string {
  const { label } = DESCRIPTIONS[run.state];
  const stage = run.stage?.trim();
  return stage ? `${label} — ${stage}` : label;
}
