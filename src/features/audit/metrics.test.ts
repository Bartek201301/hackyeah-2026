import { describe, expect, it } from "vitest";
import { classifyMetricsRead, metricsView, readMetrics } from "./metrics";
import { envelope, metrics, usage } from "./test-support";

const read = (overrides: Parameters<typeof metrics>[0] = {}) => envelope({ data: metrics(overrides) });

describe("reading the metrics response", () => {
  it("accepts the metrics payload and rejects a body that is not one", () => {
    expect(readMetrics(read())?.scope).toBe("own");
    expect(readMetrics(envelope({ data: { items: [] } }))).toBeNull();
    expect(readMetrics(envelope())).toBeNull();
    expect(readMetrics(envelope({ data: metrics({ scope: "elsewhere" as never }) }))).toBeNull();
  });

  it("refuses the organisation scope without inventing figures", () => {
    const body = envelope({
      data: metrics({ scope: "organisation" }),
      error: { code: "ACCESS_DENIED", message: "Not available to your account.", retryable: false },
    });
    expect(classifyMetricsRead(200, body).kind).toBe("denied");
  });

  it("maps a range outside one UTC day to the invalid-input state", () => {
    const body = envelope({ error: { code: "INVALID_INPUT", message: "One day only.", retryable: false } });
    expect(classifyMetricsRead(400, body).kind).toBe("invalidInput");
  });

  it("shows the unavailable state rather than a dashboard of zeros", () => {
    const body = envelope({ error: { code: "AUDIT_UNAVAILABLE", message: "m", retryable: true } });
    expect(classifyMetricsRead(503, body).kind).toBe("auditUnavailable");
  });
});

describe("the five counters", () => {
  it("keeps each counter separate and labels blocked attempts honestly", () => {
    const view = metricsView(metrics());
    expect(view.controls.map((card) => [card.label, card.value])).toEqual([
      ["Root requests", "3"],
      ["Blocked attempts", "1"],
      ["Stopped loops", "1"],
      ["Review cases", "1"],
      ["Confirmed test failures", "Unknown"],
    ]);
    const blocked = view.controls[1];
    expect(blocked.hint).toBe("Blocked attempts are refused requests, not confirmed breaches.");
    expect(blocked.hint).not.toContain("breach prevented");
  });

  it("says root requests exclude tool subcalls", () => {
    expect(metricsView(metrics()).controls[0].hint).toBe(
      "Root requests only; tool subcalls are not counted again.",
    );
  });

  it("reads an absent test report as Unknown, never as zero breaches", () => {
    const unknown = metricsView(metrics()).controls[4];
    expect(unknown.value).toBe("Unknown");
    expect(unknown.unknown).toBe(true);
    expect(unknown.hint).toBe("No dated test report yet.");

    const known = metricsView(metrics({ confirmed_test_failures: 0 })).controls[4];
    expect(known.value).toBe("0");
    expect(known.unknown).toBe(false);
  });

  it("marks a window with no decisions as empty rather than as four measured zeros", () => {
    const quiet = metrics({ root_requests: 0, blocked_attempts: 0, stopped_loops: 0, review_cases: 0 });
    expect(metricsView(quiet).empty).toBe(true);
    expect(metricsView(metrics()).empty).toBe(false);
  });
});

describe("estimates and money", () => {
  it("formats the server's reduction and avoided spend without recomputing them", () => {
    const view = metricsView(metrics());
    expect(view.estimates.map((row) => [row.label, row.value])).toEqual([
      ["Permitted corpus tokens", "48,000"],
      ["Selected context tokens", "6,240"],
      ["Context reduction", "87.0%"],
      ["Estimated avoided input spend", "USD 0.000125"],
    ]);
    expect(view.estimates.every((row) => row.estimated)).toBe(true);
  });

  it("agrees with the formula, which is how a wrong server value would be caught", () => {
    const window = metrics();
    const permitted = window.permitted_source_tokens_estimate as number;
    const selected = window.selected_source_tokens_estimate as number;
    const expected = (Math.max(0, permitted - selected) / permitted) * 100;
    expect(window.context_reduction_percent).toBeCloseTo(expected, 1);
    // The screen still prints the server's number; this assertion guards the data, not the view.
    expect(metricsView(window).estimates[2].value).toBe("87.0%");
  });

  it("renders a null reduction as N/A, never as zero per cent", () => {
    const view = metricsView(metrics({ context_reduction_percent: null }));
    expect(view.estimates[2].value).toBe("N/A");
    expect(view.estimates[2].value).not.toBe("0.0%");
  });

  it("withholds every estimate when no source trace records the baseline", () => {
    const view = metricsView(metrics({ context_trace_id: null }));
    expect(view.estimates.map((row) => row.value)).toEqual(["N/A", "N/A", "N/A", "N/A"]);
    expect(view.reductionSourceTraceId).toBeNull();
  });

  it("states the rate version and the disclaimer beside every money figure", () => {
    const view = metricsView(metrics());
    expect(view.money.value).toBe("USD 0.000018");
    expect(view.money.rateVersion).toBe("illustrative-v1");
    expect(view.money.disclaimer).toBe("Illustrative commercial equivalent; not an invoice.");
  });

  it("does not round a real cost down to zero", () => {
    expect(metricsView(metrics({ usage: usage({ comparison_micro_usd: 1 }) })).money.value).toBe(
      "USD 0.000001",
    );
    expect(metricsView(metrics({ usage: usage({ comparison_micro_usd: null }) })).money.value).toBe(
      "Not measured",
    );
  });
});

describe("the edge cases from the worksheet", () => {
  it("shows N/A for the reduction and the avoided spend when the permitted corpus is zero", () => {
    // A zero denominator cannot produce a percentage, so the server sends null and the screen says N/A.
    const view = metricsView(
      metrics({
        permitted_source_tokens_estimate: 0,
        selected_source_tokens_estimate: 0,
        context_reduction_percent: null,
        estimated_avoided_input_micro_usd: null,
      }),
    );
    expect(view.estimates.map((row) => row.value)).toEqual(["0", "0", "N/A", "N/A"]);
    expect(view.estimates[2].value).not.toBe("0.0%");
  });

  it("reads an empty day with no usage as unmeasured, while a true zero counter stays zero", () => {
    const quiet = metrics({
      root_requests: 0,
      blocked_attempts: 0,
      stopped_loops: 0,
      review_cases: 0,
      confirmed_test_failures: 0,
      usage: usage({
        generation_input_tokens: null,
        generation_output_tokens: null,
        generation_ms: null,
        semantic_input_tokens: null,
        semantic_ms: 0,
        reserved_generation_tokens: 0,
        comparison_micro_usd: null,
      }),
    });
    const view = metricsView(quiet);

    expect(view.empty).toBe(true);
    // Counters are real measurements of nothing happening; usage was never measured at all.
    expect(view.controls.map((card) => card.value)).toEqual(["0", "0", "0", "0", "0"]);
    expect(view.usage.unknown.map((row) => row.value)).toEqual([
      "Not measured",
      "Not measured",
      "Not measured",
      "Not measured",
    ]);
    expect(view.usage.actual).toEqual([{ label: "Assessment duration (Laya)", value: "0 ms" }]);
    expect(view.money.value).toBe("Not measured");
  });
});

describe("scope and window", () => {
  it("checks the reported window against the one-day rule instead of vouching for it", () => {
    expect(metricsView(metrics()).windowSingleDay).toBe(true);
    const wide = metricsView(metrics({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-03T23:59:59.999Z" }));
    expect(wide.windowSingleDay).toBe(false);
    // The figures are still shown, as reported, with the discrepancy stated.
    expect(wide.rangeFrom).toBe("2026-10-01 00:00:00 UTC");
  });

  it("echoes the scope and the window from the response, not from local state", () => {
    const own = metricsView(metrics());
    expect(own.scope).toBe("Own activity");
    expect(own.rangeFrom).toBe("2026-10-03 00:00:00 UTC");
    expect(own.rangeTo).toBe("2026-10-03 23:59:59 UTC");
    expect(metricsView(metrics({ scope: "organisation" })).scope).toBe("Organisation activity");
  });

  it("keeps generation and Laya use in separate rows on the dashboard too", () => {
    const view = metricsView(metrics());
    expect(view.usage.actual.find((row) => row.label === "Generation input")?.value).toBe("3,342 tokens");
    expect(view.usage.actual.find((row) => row.label === "Assessment input (Laya)")?.value).toBe(
      "3,072 tokens",
    );
    expect(view.usage.reserved[0].value).toBe("4,096 tokens");
  });
});
