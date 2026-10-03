/*
 * Reading and presenting GET /metrics.
 *
 * The screen performs no arithmetic on money and never re-derives the context reduction: both
 * are computed and versioned by the gateway, and the view only formats and labels them
 * (docs/product/technical-spec.md:81-85). The client-side rules are about honesty, not maths:
 *
 *  - the five counters stay five counters; a blocked attempt is not a confirmed breach
 *  - `confirmed_test_failures: null` is Unknown, never 0 and never "no breaches"
 *  - `context_reduction_percent: null` is N/A, never 0%
 *  - when no source trace is recorded, every estimate reads N/A, because an estimate without a
 *    traceable baseline is not evidence
 *  - money always carries the disclaimer and the rate version
 */
import type { Metrics } from "@/shared/contracts";
import type { Tone } from "@/shared/ui";
import type { ReadFailure } from "./envelope";
import { classifyFailure } from "./envelope";
import { copy } from "./copy";
import { formatCount, formatMicroUsd, formatPercent, formatTimestampUtc } from "./format";
import type { UsageView } from "./trace";
import { usageView } from "./trace";

export type MetricsReadState = { kind: "ok"; metrics: Metrics } | ReadFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberOrNull = (value: unknown) => value === null || typeof value === "number";

/** Narrows `data` to the metrics payload; `null` means the body is not a metrics response. */
export function readMetrics(body: unknown): Metrics | null {
  if (!isRecord(body)) return null;
  const { data } = body;
  if (!isRecord(data)) return null;
  const scopeOk = data.scope === "own" || data.scope === "organisation";
  const counters = ["root_requests", "blocked_attempts", "stopped_loops", "review_cases"] as const;
  const estimates = [
    "permitted_source_tokens_estimate",
    "selected_source_tokens_estimate",
    "context_reduction_percent",
    "estimated_avoided_input_micro_usd",
  ] as const;
  if (!scopeOk) return null;
  if (typeof data.from !== "string" || typeof data.to !== "string") return null;
  if (!counters.every((key) => typeof data[key] === "number")) return null;
  if (!isNumberOrNull(data.confirmed_test_failures)) return null;
  if (!estimates.every((key) => isNumberOrNull(data[key]))) return null;
  if (data.context_trace_id !== null && typeof data.context_trace_id !== "string") return null;
  if (!isRecord(data.usage)) return null;
  return data as unknown as Metrics;
}

export function classifyMetricsRead(status: number, body: unknown): MetricsReadState {
  const metrics = readMetrics(body);
  const failure = classifyFailure(status, body, metrics !== null);
  if (failure) return failure;
  // classifyFailure only returns null when a payload was found.
  return { kind: "ok", metrics: metrics as Metrics };
}

export type CounterCard = {
  label: string;
  value: string;
  hint: string | null;
  /** True when the number is absent rather than zero; the card says so instead of showing 0. */
  unknown: boolean;
};

export type EstimateRow = {
  label: string;
  value: string;
  /** Every estimate row is labelled as an estimate on screen, including when it reads N/A. */
  estimated: boolean;
};

export type MetricsView = {
  scope: string;
  rangeFrom: string;
  rangeTo: string;
  controls: CounterCard[];
  usage: UsageView;
  money: { value: string; rateVersion: string; disclaimer: string };
  estimates: EstimateRow[];
  reductionSourceTraceId: string | null;
  /** True when the window recorded nothing at all, which is different from recording zeros. */
  empty: boolean;
  tone: Tone;
};

/**
 * The five counters, in the order agreed for the dashboard. They are never summed with each
 * other and never folded into one "incidents" figure: each answers a different question.
 */
function controlCards(metrics: Metrics): CounterCard[] {
  return [
    {
      label: copy.metrics.rootRequests,
      value: formatCount(metrics.root_requests),
      hint: copy.metrics.rootHint,
      unknown: false,
    },
    {
      label: copy.metrics.blockedAttempts,
      value: formatCount(metrics.blocked_attempts),
      hint: copy.disclaimer.blocked,
      unknown: false,
    },
    {
      label: copy.metrics.stoppedLoops,
      value: formatCount(metrics.stopped_loops),
      hint: null,
      unknown: false,
    },
    { label: copy.metrics.reviewCases, value: formatCount(metrics.review_cases), hint: null, unknown: false },
    metrics.confirmed_test_failures === null
      ? {
          label: copy.metrics.testFailures,
          value: copy.label.unknown,
          hint: copy.metrics.testHint,
          unknown: true,
        }
      : {
          label: copy.metrics.testFailures,
          value: formatCount(metrics.confirmed_test_failures),
          hint: null,
          unknown: false,
        },
  ];
}

export function metricsView(metrics: Metrics): MetricsView {
  // Without a source trace the baseline cannot be inspected, so no estimate is presented as a
  // figure. This is stricter than the contract requires and deliberately so.
  const traceable = metrics.context_trace_id !== null;
  const estimate = (value: number | null, format: (value: number) => string) =>
    !traceable || value === null ? copy.label.na : format(value);

  const empty =
    metrics.root_requests === 0 &&
    metrics.blocked_attempts === 0 &&
    metrics.stopped_loops === 0 &&
    metrics.review_cases === 0;

  return {
    scope: metrics.scope === "organisation" ? copy.metrics.scopeOrganisation : copy.metrics.scopeOwn,
    rangeFrom: formatTimestampUtc(metrics.from),
    rangeTo: formatTimestampUtc(metrics.to),
    controls: controlCards(metrics),
    usage: usageView(metrics.usage),
    money: {
      value: formatMicroUsd(metrics.usage.comparison_micro_usd),
      rateVersion: metrics.usage.comparison_rate_version,
      disclaimer: copy.disclaimer.money,
    },
    estimates: [
      {
        label: copy.metrics.permittedCorpus,
        value: estimate(metrics.permitted_source_tokens_estimate, (value) => formatCount(Math.round(value))),
        estimated: true,
      },
      {
        label: copy.metrics.selectedContext,
        value: estimate(metrics.selected_source_tokens_estimate, (value) => formatCount(Math.round(value))),
        estimated: true,
      },
      {
        label: copy.metrics.contextReduction,
        value: estimate(metrics.context_reduction_percent, formatPercent),
        estimated: true,
      },
      {
        label: copy.metrics.avoidedSpend,
        value: estimate(metrics.estimated_avoided_input_micro_usd, (value) =>
          formatMicroUsd(Math.round(value)),
        ),
        estimated: true,
      },
    ],
    reductionSourceTraceId: metrics.context_trace_id,
    empty,
    tone: metrics.blocked_attempts > 0 ? "warning" : "neutral",
  };
}
