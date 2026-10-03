/*
 * The assertions that decide whether this feature is safe to show a judge.
 *
 * AT10-4 says no rendered audit state may contain prompt text, excerpt text, document titles,
 * secret values or contact canaries. There is no DOM runner yet, so these tests attack the layer
 * below the DOM: a payload is crafted with exactly those fields added, the view models are built
 * from it, and the whole model is searched for the forbidden strings. A component can only render
 * what the model carries, so a model that cannot carry the text cannot leak it.
 *
 * The payload passes shape validation on purpose: `readProjections` tolerates fields this feature
 * does not read, which is what makes this test meaningful rather than circular.
 */
import { describe, expect, it } from "vitest";
import { classifyActivityRead } from "./activity";
import { classifyTraceRead } from "./envelope";
import { metricsView } from "./metrics";
import { stageRows } from "./trace";
import { FORBIDDEN, contaminatedProjection, envelope, metrics, projection } from "./test-support";

const leaks = (value: unknown) => {
  const serialised = JSON.stringify(value);
  return FORBIDDEN.filter((secret) => serialised.includes(secret));
};

const contaminated = contaminatedProjection;

describe("no protected text reaches a view model", () => {
  it("accepts the contaminated projection, so the test is not circular", () => {
    expect(classifyTraceRead(200, envelope({ data: { items: [contaminated()] } })).kind).toBe("ok");
  });

  it("keeps prompts, titles, secrets and canaries out of the trace state", () => {
    const state = classifyTraceRead(200, envelope({ data: { items: [contaminated()] } }));
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    // The projection itself is the raw record; the screen renders the derived rows below.
    expect(leaks(stageRows(state.trace.events))).toEqual([]);
  });

  it("keeps them out of the activity rows", () => {
    const state = classifyActivityRead(200, envelope({ data: { items: [contaminated()] } }), {
      showActor: true,
    });
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(leaks(state.rows)).toEqual([]);
  });

  it("keeps them out of the dashboard view", () => {
    const contaminatedMetrics = {
      ...metrics(),
      answer: FORBIDDEN[4],
      document_title: FORBIDDEN[1],
      api_key: FORBIDDEN[2],
    };
    expect(leaks(metricsView(contaminatedMetrics))).toEqual([]);
  });

  it("still shows the reason codes, which are the evidence a blocked trace must carry", () => {
    const state = classifyActivityRead(200, envelope({ data: { items: [contaminated()] } }));
    if (state.kind !== "ok") throw new Error("expected a readable list");
    expect(state.rows[0].inlineReasons).toEqual(["ACCESS_DENIED", "RESTRICTED_SOURCE"]);
    expect(state.rows[0].decisionLabel).toBe("Blocked");
  });

  it("shows a finding without a value, and does not invent one", () => {
    const rows = stageRows(contaminated().events);
    const [finding] = rows[0].findings;
    expect(finding.code).toBe("RESTRICTED_SOURCE");
    expect(finding.locator).toBe("row:14");
    expect(Object.keys(finding).sort()).toEqual(["category", "code", "locator", "severity", "stage", "tone"]);
  });
});

describe("the list is never an aggregate", () => {
  it("exposes rows and paging only, so no screen can present a page as a total", () => {
    const state = classifyActivityRead(200, envelope({ data: { items: [projection(), projection()] } }));
    expect(Object.keys(state).sort()).toEqual(["kind", "nextCursor", "pageCapped", "rows"]);
  });

  it("takes organisation figures from the metrics response, not from the rows on screen", () => {
    // Seven rows on the page, three root requests in the window: the dashboard shows three.
    const rows = Array.from({ length: 7 }, () => projection());
    const list = classifyActivityRead(200, envelope({ data: { items: rows } }));
    const view = metricsView(metrics({ scope: "organisation", root_requests: 3 }));
    expect(list.kind).toBe("ok");
    if (list.kind !== "ok") return;
    expect(list.rows).toHaveLength(7);
    expect(view.controls[0].value).toBe("3");
  });
});
