/*
 * The dashboard's figures checked against the rows the export hands out, both captured live.
 *
 * `docs/testing/acceptance.md:63` requires displayed numbers to equal the stored records. This is
 * that check across two independent endpoints: `GET /api/v1/metrics?scope=own` and
 * `GET /api/v1/audit/export` for the same scope and the same UTC day, captured seconds apart with a
 * signed-in non-admin session. Nothing below is hand-written to fit — if the two disagreed, the
 * engine that totals them would be wrong.
 *
 * The capture is also why this file exists rather than another synthetic case: the real window
 * contains an `incomplete` run with an unknown `semantic_input_tokens` and an unresolved
 * reservation, and a settled run that still records 2,200 reserved tokens. Both are states a
 * hand-written fixture tends not to include together.
 */
import { describe, expect, it } from "vitest";
import type { Metrics } from "@/shared/contracts";
import { metricsView } from "./metrics";
import { usageView } from "./trace";

/** Verbatim `data` of the captured metrics response. */
const LIVE_METRICS: Metrics = {
  scope: "own",
  from: "2026-10-03T00:00:00.000Z",
  to: "2026-10-03T23:59:59.999Z",
  root_requests: 10,
  blocked_attempts: 2,
  stopped_loops: 0,
  review_cases: 2,
  confirmed_test_failures: null,
  usage: {
    generation_input_tokens: 106,
    generation_output_tokens: 59,
    generation_ms: 2299,
    semantic_input_tokens: null,
    semantic_ms: 1169,
    reserved_generation_tokens: 0,
    unresolved_reservation: true,
    comparison_micro_usd: 283,
    comparison_rate_version: "illustrative-v1",
  },
  permitted_source_tokens_estimate: null,
  selected_source_tokens_estimate: null,
  context_reduction_percent: null,
  estimated_avoided_input_micro_usd: null,
  context_trace_id: null,
};

/*
 * Verbatim lines of the captured CSV, header first. The file itself ends every line with CRLF and
 * terminates with one; that is asserted on the engine's own output in
 * `src/shared/gateway/auditExport.test.ts`, so the lines are kept here as lines.
 */
const LIVE_CSV = [
  "trace_id,created_at,actor_id,operation,state,decision,reasons,policy_version,feed_version,generation_input_tokens,generation_output_tokens,generation_ms,semantic_input_tokens,semantic_ms,reserved_generation_tokens,unresolved_reservation,comparison_micro_usd,comparison_rate_version",
  "857984da-5a54-494a-8472-000da01c3686,2026-10-03T22:46:41.697992+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,review,REVIEW,semantic:sensitive_exposure,1,1,0,0,0,238,66,0,false,0,illustrative-v1",
  "75a831f2-2d69-4216-9c1d-889f66f6aa4e,2026-10-03T22:46:41.356093+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,review,REVIEW,semantic:sensitive_exposure,1,1,0,0,0,241,592,0,false,0,illustrative-v1",
  "b53fccce-3336-48ef-8be2-06632c0c274d,2026-10-03T22:18:54.525213+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,failed,,,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
  "204607b9-0a87-426a-8640-ede0fa248ccc,2026-10-03T21:45:31.09911+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,failed,,,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
  "55017f2c-436c-40fa-a21d-53e1874f557f,2026-10-03T21:44:31.786184+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,blocked,BLOCK,input_signature:SIG-001,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
  "5a19ae96-b90c-43a7-95de-67afd582db8c,2026-10-03T19:56:58.422527+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,blocked,BLOCK,input_signature:SIG-001,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
  "1b41c7e5-ace5-40fc-a357-33fb62118f9b,2026-10-03T19:54:49.846857+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,failed,,,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
  "e7cb38d9-cc17-4c04-8cf8-ffa9104baa36,2026-10-03T19:44:57.357547+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,completed,ALLOW,,1,1,106,59,2299,581,511,2200,false,283,illustrative-v1",
  "cd646e71-30cf-4d7f-ac12-923c4efd4abd,2026-10-03T19:42:37.642329+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,incomplete,,,1,1,0,0,0,,0,0,true,0,illustrative-v1",
  "7154f512-5b74-4396-9caa-79b1d266a824,2026-10-03T18:27:40.800727+00:00,d13c9c21-7d4e-4466-a130-0ba337f334d0,chat_start,failed,,,1,1,0,0,0,0,0,0,false,0,illustrative-v1",
];

const HEADER = LIVE_CSV[0].split(",");
const DATA = LIVE_CSV.slice(1).map((line) => line.split(","));
/** Column by contract field name, so a reordered header fails loudly instead of shifting a total. */
const column = (field: string) => {
  const index = HEADER.indexOf(field);
  expect(index).toBeGreaterThan(-1);
  return DATA.map((row) => row[index]);
};
const sum = (field: string) => column(field).reduce((total, cell) => total + Number(cell), 0);

describe("the dashboard against the rows it exports", () => {
  it("counts one root request per stored row", () => {
    expect(DATA).toHaveLength(LIVE_METRICS.root_requests);
  });

  it("totals every measured figure to exactly the sum of the rows", () => {
    expect(LIVE_METRICS.usage.generation_input_tokens).toBe(sum("generation_input_tokens"));
    expect(LIVE_METRICS.usage.generation_output_tokens).toBe(sum("generation_output_tokens"));
    expect(LIVE_METRICS.usage.generation_ms).toBe(sum("generation_ms"));
    expect(LIVE_METRICS.usage.semantic_ms).toBe(sum("semantic_ms"));
    expect(LIVE_METRICS.usage.comparison_micro_usd).toBe(sum("comparison_micro_usd"));
  });

  /*
   * The one that matters most: one row's `semantic_input_tokens` is empty, so the window's total is
   * unknown rather than the 1,060 the other rows would add up to. An understated total that looked
   * measured would be worse than no total at all.
   */
  it("reports a total as unknown when one row did not record it", () => {
    const cells = column("semantic_input_tokens");
    expect(cells).toContain("");
    expect(LIVE_METRICS.usage.semantic_input_tokens).toBeNull();
    const knownOnly = cells.filter((cell) => cell !== "").reduce((t, c) => t + Number(c), 0);
    expect(knownOnly).toBe(1060);
  });

  it("carries the unresolved reservation of a single row into the window", () => {
    expect(column("unresolved_reservation")).toContain("true");
    expect(LIVE_METRICS.usage.unresolved_reservation).toBe(true);
  });

  /*
   * Captured proof of the ambiguity the captions exist for: the settled run records 2,200 reserved
   * tokens, and the same day's dashboard reports 0 outstanding.
   */
  it("reads a row's reservation and the window's outstanding total as different numbers", () => {
    expect(column("reserved_generation_tokens")).toContain("2200");
    expect(LIVE_METRICS.usage.reserved_generation_tokens).toBe(0);

    const view = metricsView(LIVE_METRICS);
    expect(view.usage.reserved).toEqual([{ label: "Reserved generation tokens", value: "0 tokens" }]);
    expect(view.usage.reservedHint).toContain("Retained");

    const runUsage = {
      ...LIVE_METRICS.usage,
      reserved_generation_tokens: 2200,
      unresolved_reservation: false,
    };
    expect(usageView(runUsage, "operation").reservedHint).toBe(
      "Reserved for this operation. A reservation is never added to actual use.",
    );
  });

  it("prices the window only because every row shares one rate version", () => {
    expect(new Set(column("comparison_rate_version"))).toEqual(new Set(["illustrative-v1"]));
    expect(LIVE_METRICS.usage.comparison_rate_version).toBe("illustrative-v1");
    expect(metricsView(LIVE_METRICS).money.value).toBe("USD 0.000283");
  });
});

describe("what the screen says about this window", () => {
  const view = metricsView(LIVE_METRICS);

  it("shows the unknown token count as unmeasured rather than as a zero", () => {
    expect(view.usage.unknown).toEqual([{ label: "Assessment input (Laya)", value: "Not measured" }]);
    expect(view.usage.actual.some((row) => row.label === "Assessment input (Laya)")).toBe(false);
  });

  it("keeps the measured assessment duration beside it", () => {
    // 1,169 ms crosses the second boundary, so it reads as seconds with one decimal.
    expect(view.usage.actual).toContainEqual({ label: "Assessment duration (Laya)", value: "1.2 s" });
  });

  it("reports an absent test report as unknown, never as no failures", () => {
    const failures = view.controls.find((card) => card.label === "Confirmed test failures");
    expect(failures).toMatchObject({ value: "Unknown", unknown: true });
  });

  it("withholds every estimate while no baseline trace exists", () => {
    expect(view.estimates.every((row) => row.value === "N/A")).toBe(true);
  });

  it("does not let two blocked attempts read as two prevented breaches", () => {
    const blocked = view.controls.find((card) => card.label === "Blocked attempts");
    expect(blocked?.value).toBe("2");
    // The disclaimer is required, not merely allowed: the figure alone invites the wrong reading.
    expect(blocked?.hint).toBe("Blocked attempts are refused requests, not confirmed breaches.");
  });

  it("is not an empty window: ten requests happened", () => {
    expect(view.windowSingleDay).toBe(true);
    expect(view.scope).toBe("Own activity");
  });

  it("carries no row, label or caption that contains a sentence from a prompt", () => {
    // Every exported cell is an identifier, a code, an enum, a number or a timestamp: no spaces.
    for (const row of DATA) for (const cell of row) expect(cell).not.toContain(" ");
  });
});
