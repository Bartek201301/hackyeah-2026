/*
 * Reading and presenting GET /audit — the recent-activity list.
 *
 * Rules that this layer enforces, each with a test:
 *  - the list is one page, never a total: the response carries no `has_more`, so a full page
 *    means "the 100 most recent", not "everything" (open question 4 for the integrator)
 *  - a row's token figure is the sum of settled provider-reported counts, and when either side
 *    is unknown the row says Not measured rather than summing around a null
 *  - reason codes are shown as codes; a row never resolves an actor id into a name, because no
 *    name source exists in this contract
 */
import type { AuditProjection } from "@/shared/contracts";
import type { Tone } from "@/shared/ui";
import type { ReadFailure } from "./envelope";
import { classifyFailure, readProjections } from "./envelope";
import { copy } from "./copy";
import { formatTimestampUtc, formatTokens, shortId } from "./format";
import { decisionBadge } from "./trace";

/** The contract caps one page of `/audit` at 100 items. */
export const PAGE_CAP = 100;

/** Reason codes shown inline on a row; the rest are counted and read in the trace detail. */
const INLINE_REASONS = 2;

export type ActivityRow = {
  traceId: string;
  traceIdShort: string;
  operation: string;
  when: string;
  decisionLabel: string;
  decisionTone: Tone;
  state: string;
  inlineReasons: string[];
  hiddenReasons: number;
  policyVersion: number;
  feedVersion: number;
  tokens: string;
  unresolvedReservation: boolean;
  actorIdShort: string | null;
};

export type ActivityReadState =
  | {
      kind: "ok";
      rows: ActivityRow[];
      /** A full page means more may exist; the footer says so instead of implying completeness. */
      pageCapped: boolean;
      /** Value for `after` on the next request: the last row of this page. */
      nextCursor: string | null;
    }
  | ReadFailure;

/**
 * Settled generation tokens for a row. Both sides must be known: adding a number to an unknown
 * would present a partial figure as a total.
 */
export function settledGenerationTokens(projection: AuditProjection): string {
  const { generation_input_tokens: input, generation_output_tokens: output } = projection.usage;
  if (input === null || output === null) return copy.label.notMeasured;
  return formatTokens(input + output);
}

export function activityRows(
  items: readonly AuditProjection[],
  options: { showActor: boolean } = { showActor: false },
): ActivityRow[] {
  return items.map((projection) => {
    const badge = decisionBadge(projection.decision, projection.state);
    return {
      traceId: projection.trace_id,
      traceIdShort: shortId(projection.trace_id),
      operation: projection.operation,
      when: formatTimestampUtc(projection.created_at),
      decisionLabel: badge.label,
      decisionTone: badge.tone,
      state: projection.state,
      inlineReasons: projection.reasons.slice(0, INLINE_REASONS),
      hiddenReasons: Math.max(0, projection.reasons.length - INLINE_REASONS),
      policyVersion: projection.policy_version,
      feedVersion: projection.feed_version,
      tokens: settledGenerationTokens(projection),
      unresolvedReservation: projection.usage.unresolved_reservation,
      // In own scope every row is the viewer, so the identifier adds nothing to the screen.
      actorIdShort: options.showActor ? shortId(projection.actor_id) : null,
    };
  });
}

export function classifyActivityRead(
  status: number,
  body: unknown,
  options: { showActor: boolean } = { showActor: false },
): ActivityReadState {
  const items = readProjections(body);
  const failure = classifyFailure(status, body, items !== null);
  if (failure) return failure;

  const projections = items as AuditProjection[];
  const rows = activityRows(projections, options);
  return {
    kind: "ok",
    rows,
    pageCapped: projections.length >= PAGE_CAP,
    nextCursor: projections.length > 0 ? projections[projections.length - 1].trace_id : null,
  };
}
