import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, Metrics, Usage } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { envelope, errorOutcome } from "./envelope";
import type { GatewayDeps, MetricsActivityRow, MetricsReservationRow, Outcome } from "./ports";

/*
 * metrics_read: the reporting window for one actor or one organisation.
 *
 * Everything here is counted from persisted rows — `actor_activity` for the counters and settled
 * usage, `reservations` for what is still outstanding. Never from a page of a list: a page is the
 * most recent N records, and presenting it as a total would be a measurement of the page, not of
 * the window (docs/product/technical-spec.md:85).
 *
 * One `actor_activity` row is written per run by `finalize_run`, so counting rows counts root
 * requests. Tool and provider calls inside a run are reservations and audit events, not activity
 * rows, so nothing is counted twice.
 *
 * No audit write: this is a projection read, like source_list.
 */

/** Rows read per window. A window that exceeds it is refused rather than silently truncated. */
export const METRICS_ROW_CAP = 1000;

/**
 * A loop stop is a refusal on repetition or a call ceiling, and it is reported separately from a
 * security refusal (`docs/product/technical-spec.md:85`, and `Nikodem/01-field-map.md` §3.1: a loop
 * stop is "never folded into blocked attempts"). The engine currently emits one such code; the set
 * grows when T03 adds round and repetition ceilings.
 */
export const LOOP_STOP_REASONS = ["generation:tool_call_refused"];

const isLoopStop = (reasons: readonly string[]) =>
  reasons.some((reason) => LOOP_STOP_REASONS.includes(reason));

/** `from`/`to` for the whole of a UTC day. */
export function utcDayBounds(day: Date): { from: string; to: string } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000 - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * The window a request asked for, or null when it is not one the contract allows.
 *
 * Absent means the current UTC day. Both bounds must be given together, both must parse, `from`
 * must not follow `to`, and the two must fall on the same UTC day — `protocols.md:120` confines a
 * range to one day. A longer range is refused, never clamped: a silently narrowed window would
 * report figures for a period the caller did not ask about.
 */
export function parseWindow(
  from: string | null,
  to: string | null,
  now: Date,
): { from: string; to: string } | null {
  if (from === null && to === null) return utcDayBounds(now);
  if (from === null || to === null) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  if (start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10)) return null;
  return { from: start.toISOString(), to: end.toISOString() };
}

export function parseScope(value: string | null): Metrics["scope"] | null {
  if (value === null || value === "own") return "own";
  return value === "organisation" ? "organisation" : null;
}

/** Adds two measurements where unknown wins: a total that includes an unknown part is unknown. */
const addKnown = (total: number | null, next: number | null | undefined) =>
  total === null || next === null || next === undefined ? null : total + next;

/**
 * Sums the settled usage of the window, and the reservations still outstanding.
 *
 * Unknown contaminates: one trace whose provider never reported its count makes that total unknown
 * rather than lower than reality. Money is only summed inside one rate version — adding figures
 * priced by different versioned rates would produce a number that is not a price at all.
 */
export function aggregateUsage(
  activity: readonly MetricsActivityRow[],
  reservations: readonly MetricsReservationRow[],
): Usage {
  let generationIn: number | null = 0;
  let generationOut: number | null = 0;
  let generationMs: number | null = 0;
  let semanticIn: number | null = 0;
  let semanticMs = 0;
  let micro: number | null = 0;
  const rateVersions = new Set<string>();

  for (const row of activity) {
    const usage = row.usage ?? ({} as Usage);
    generationIn = addKnown(generationIn, usage.generation_input_tokens);
    generationOut = addKnown(generationOut, usage.generation_output_tokens);
    generationMs = addKnown(generationMs, usage.generation_ms);
    semanticIn = addKnown(semanticIn, usage.semantic_input_tokens);
    semanticMs += usage.semantic_ms ?? 0;
    micro = addKnown(micro, usage.comparison_micro_usd);
    if (usage.comparison_rate_version) rateVersions.add(usage.comparison_rate_version);
  }

  // Charged = reconciled conservatively: spent at the reserved amount with the actual unknown. It is
  // never outstanding, and it makes the measured total of its unit unknown, never zero.
  const charged = new Set(reservations.filter((r) => r.state === "charged").map((r) => r.unit));
  if (charged.has("generation_tokens")) [generationIn, generationOut, micro] = [null, null, null];
  if (charged.has("generation_ms")) generationMs = null;
  if (charged.has("semantic_tokens")) semanticIn = null;

  // Outstanding means not yet reconciled: reserved or unresolved, never settled, released or charged.
  const outstanding = reservations.filter((r) => r.state === "reserved" || r.state === "unresolved");
  const reserved = outstanding
    .filter((r) => r.unit === "generation_tokens")
    .reduce((total, r) => total + r.amount, 0);

  const priced = rateVersions.size === 1;
  return {
    generation_input_tokens: generationIn,
    generation_output_tokens: generationOut,
    generation_ms: generationMs,
    semantic_input_tokens: semanticIn,
    semantic_ms: semanticMs,
    reserved_generation_tokens: reserved,
    unresolved_reservation: outstanding.some((r) => r.state === "unresolved"),
    // Two rate versions in one window cannot be added into one price.
    comparison_micro_usd: priced ? micro : null,
    comparison_rate_version: priced ? [...rateVersions][0] : "mixed",
  };
}

export function aggregate(
  scope: Metrics["scope"],
  window: { from: string; to: string },
  activity: readonly MetricsActivityRow[],
  reservations: readonly MetricsReservationRow[],
): Metrics {
  const loops = activity.filter((row) => row.decision === "BLOCK" && isLoopStop(row.reasons));
  return {
    scope,
    from: window.from,
    to: window.to,
    // One row per run, so this counts root requests and never a tool call inside one.
    root_requests: activity.length,
    // Separate counters: a loop stop is a ceiling refusal, not a security refusal.
    blocked_attempts: activity.filter((row) => row.decision === "BLOCK" && !isLoopStop(row.reasons)).length,
    stopped_loops: loops.length,
    review_cases: activity.filter((row) => row.decision === "REVIEW").length,
    // No dated test report exists to count, and an absent report is not zero failures.
    confirmed_test_failures: null,
    usage: aggregateUsage(activity, reservations),
    // No permitted-corpus baseline is computed yet, so nothing is estimated. Null, never 0: the
    // screen renders N/A and withholds the derived figures rather than implying a measurement.
    permitted_source_tokens_estimate: null,
    selected_source_tokens_estimate: null,
    context_reduction_percent: null,
    estimated_avoided_input_micro_usd: null,
    context_trace_id: null,
  };
}

/**
 * The organisation scope is an admin-only read, decided here from the trusted actor record, never
 * from anything the caller sent. A non-admin asking for it is refused, not quietly downgraded to
 * their own figures under an organisation heading.
 */
export async function readMetrics(
  deps: GatewayDeps,
  actor: ActorContext,
  params: { scope: string | null; from: string | null; to: string | null },
  now: Date = new Date(),
): Promise<Outcome> {
  const scope = parseScope(params.scope);
  if (scope === null) return errorOutcome("INVALID_INPUT");
  if (scope === "organisation" && actor.role !== "admin") return errorOutcome("ACCESS_DENIED");

  const window = parseWindow(params.from, params.to, now);
  if (window === null) {
    return errorOutcome("INVALID_INPUT", {
      message: "Select a range inside a single UTC day.",
    });
  }

  const { activity, reservations } = await deps.repository.readMetricsRows({
    organisationId: actor.organisation_id,
    ownActorId: scope === "own" ? actor.actor_id : null,
    from: window.from,
    to: window.to,
    // One past the cap, so a window of exactly the cap still totals and only a larger one refuses.
    limit: METRICS_ROW_CAP + 1,
  });
  // Above the cap the window is larger than one read can total. Refuse rather than report a part of
  // it as the whole: an understated total is worse than no total.
  if (activity.length > METRICS_ROW_CAP || reservations.length > METRICS_ROW_CAP) {
    return errorOutcome("INVALID_INPUT", {
      message: "This window holds more than 1000 records; narrow the range.",
    });
  }

  // Each stored usage is schema-checked before it is added up. A malformed row would otherwise be
  // read as zeros through the defaults below and quietly understate the window.
  for (const row of activity) {
    if (!check("Usage", row.usage).ok) return errorOutcome("STATE_UNAVAILABLE");
  }

  const metrics = aggregate(scope, window, activity, reservations);
  const checked = check("Metrics", metrics);
  if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");

  return {
    status: 200,
    body: envelope({ trace_id: randomUUID(), decision: "ALLOW", data: checked.value }),
  };
}
