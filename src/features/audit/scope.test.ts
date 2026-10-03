import { describe, expect, it } from "vitest";
import { classifyMetricsRead, metricsView } from "./metrics";
import { parseScope } from "./scope";
import { envelope, metrics } from "./test-support";

describe("parsing the reporting scope", () => {
  it("accepts the two scopes the contract defines", () => {
    expect(parseScope("own")).toBe("own");
    expect(parseScope("organisation")).toBe("organisation");
  });

  it("falls back to the narrower scope for anything else", () => {
    expect(parseScope(undefined)).toBe("own");
    expect(parseScope("")).toBe("own");
    expect(parseScope("ORGANISATION")).toBe("own");
    expect(parseScope("organisation; drop table")).toBe("own");
    expect(parseScope(["organisation", "own"])).toBe("own");
    expect(parseScope("everyone")).toBe("own");
  });
});

describe("the organisation scope", () => {
  it("renders the refusal and no organisation figure when the actor may not read it", () => {
    const body = envelope({
      error: { code: "ACCESS_DENIED", message: "Not available to your account.", retryable: false },
    });
    const state = classifyMetricsRead(403, body);
    expect(state.kind).toBe("denied");
    // There is no payload to read, so no figure can be derived from the refusal.
    expect("metrics" in state).toBe(false);
  });

  it("ignores organisation figures that arrive beside a refusal", () => {
    // A server that sent both would be wrong; the screen still refuses, because the error decides.
    const body = envelope({
      data: metrics({ scope: "organisation", root_requests: 412, blocked_attempts: 37 }),
      error: { code: "ACCESS_DENIED", message: "Not available to your account.", retryable: false },
    });
    const state = classifyMetricsRead(200, body);
    expect(state.kind).toBe("denied");
    expect(JSON.stringify(state)).not.toContain("412");
    expect(JSON.stringify(state)).not.toContain("37");
  });

  it("labels an organisation window as organisation activity", () => {
    const view = metricsView(metrics({ scope: "organisation" }));
    expect(view.scope).toBe("Organisation activity");
  });
});
