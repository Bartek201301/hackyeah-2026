import { describe, expect, it } from "vitest";
import { EVENT_CAP, classifyTraceRead, readError, readProjections } from "./envelope";
import { auditEvent, envelope, projection, usage } from "./test-support";

const withTrace = (overrides: Parameters<typeof projection>[0] = {}) =>
  envelope({ data: { items: [projection(overrides)] } });

describe("reading the envelope", () => {
  it("treats HTTP 200 with an error as a refusal, because 200 is not approval", () => {
    const body = envelope({
      data: { items: [projection()] },
      error: { code: "ACCESS_DENIED", message: "Not available to your account.", retryable: false },
    });
    expect(classifyTraceRead(200, body).kind).toBe("denied");
  });

  it("maps every error code reachable on an audit read to its own state", () => {
    const cases: Array<[string, string]> = [
      ["UNAUTHENTICATED", "unauthenticated"],
      ["ACCESS_DENIED", "denied"],
      ["NOT_FOUND", "notFound"],
      ["INVALID_INPUT", "invalidInput"],
      ["RATE_LIMITED", "rateLimited"],
      ["BUDGET_EXHAUSTED", "rateLimited"],
      ["AUDIT_UNAVAILABLE", "auditUnavailable"],
      ["STATE_UNAVAILABLE", "stateUnavailable"],
    ];
    for (const [code, kind] of cases) {
      const body = envelope({ error: { code, message: "m", retryable: true } });
      expect(classifyTraceRead(503, body).kind, code).toBe(kind);
    }
  });

  it("does not invent a state for a code that cannot reach this feature", () => {
    const body = envelope({ error: { code: "POLICY_UNAVAILABLE", message: "m", retryable: true } });
    expect(classifyTraceRead(503, body).kind).toBe("clientError");
  });

  it("rejects a body that is not an audit payload instead of rendering half a screen", () => {
    expect(classifyTraceRead(200, envelope({ data: { answer: "text", citations: [] } })).kind).toBe(
      "clientError",
    );
    expect(classifyTraceRead(200, envelope({ data: { items: [{ trace_id: "x" }] } })).kind).toBe(
      "clientError",
    );
    expect(classifyTraceRead(200, "<html>502</html>").kind).toBe("clientError");
    expect(classifyTraceRead(200, null).kind).toBe("clientError");
  });

  it("separates an empty result from an unrecognised one", () => {
    expect(readProjections(envelope({ data: { items: [] } }))).toEqual([]);
    expect(readProjections(envelope({ data: null }))).toBeNull();
    expect(classifyTraceRead(200, envelope({ data: { items: [] } })).kind).toBe("notFound");
  });

  it("accepts a projection that carries fields this feature does not read", () => {
    const body = envelope({ data: { items: [{ ...projection(), extra_field: "added later" }] } });
    expect(classifyTraceRead(200, body).kind).toBe("ok");
  });

  it("reads the error for any status and tolerates a missing message", () => {
    expect(readError(envelope({ error: { code: "NOT_FOUND", message: "gone", retryable: false } }))).toEqual({
      code: "NOT_FOUND",
      message: "gone",
    });
    expect(readError(envelope())).toBeNull();
    expect(readError({ error: { code: "NOT_FOUND" } })).toEqual({ code: "NOT_FOUND", message: "" });
  });
});

describe("states of the inspected trace", () => {
  it("returns the trace from data.items[0], never from the envelope root", () => {
    const state = classifyTraceRead(200, withTrace());
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    // The envelope root is a different trace with a different policy version on purpose.
    expect(state.trace.trace_id).toBe("3f6c1d2e-9b47-4c81-a0f5-7d2e5b914c33");
    expect(state.trace.policy_version).toBe(7);
    expect(state.trace.usage.generation_input_tokens).toBe(1842);
  });

  it("marks an incomplete operation from the projection state alone", () => {
    const state = classifyTraceRead(200, withTrace({ state: "incomplete", decision: null }));
    expect(state).toMatchObject({ kind: "ok", incomplete: true });
  });

  it("renders the trace with a notice when the read reports INCOMPLETE", () => {
    const body = envelope({
      data: { items: [projection({ state: "incomplete" })] },
      error: {
        code: "INCOMPLETE",
        message: "Narrow the range to inspect the remaining stages.",
        retryable: true,
      },
    });
    expect(classifyTraceRead(200, body)).toMatchObject({
      kind: "ok",
      incomplete: true,
      serverMessage: "Narrow the range to inspect the remaining stages.",
    });
  });

  it("falls back to a client error when INCOMPLETE arrives with nothing to show", () => {
    const body = envelope({ error: { code: "INCOMPLETE", message: "m", retryable: true } });
    expect(classifyTraceRead(200, body).kind).toBe("clientError");
  });

  it("recognises cancellation from the reason codes", () => {
    const state = classifyTraceRead(200, withTrace({ reasons: ["CANCELLED"], state: "cancelled" }));
    expect(state).toMatchObject({ kind: "ok", cancelled: true });
  });

  it("flags the event cap so a partial stage list is never shown as complete", () => {
    const events = Array.from({ length: EVENT_CAP }, (_, index) =>
      auditEvent({ created_at: new Date(Date.UTC(2026, 9, 3, 9, 41, index)).toISOString() }),
    );
    const capped = classifyTraceRead(200, withTrace({ events }));
    expect(capped).toMatchObject({ kind: "ok", eventsCapped: true });

    const short = classifyTraceRead(200, withTrace({ events: events.slice(0, 5) }));
    expect(short).toMatchObject({ kind: "ok", eventsCapped: false });
  });

  it("keeps unknown usage unknown rather than reading it as zero", () => {
    const state = classifyTraceRead(
      200,
      withTrace({
        state: "incomplete",
        usage: usage({
          generation_input_tokens: null,
          generation_output_tokens: null,
          generation_ms: null,
          unresolved_reservation: true,
        }),
      }),
    );
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(state.trace.usage.generation_input_tokens).toBeNull();
    expect(state.trace.usage.unresolved_reservation).toBe(true);
  });

  it("treats a non-2xx status without a recognised code as a client error", () => {
    expect(classifyTraceRead(500, envelope({ data: { items: [projection()] } })).kind).toBe("clientError");
  });
});

describe("the gateway as it answers today", () => {
  /*
   * Captured verbatim from GET /api/v1/audit/{id} against a local production build at the G1
   * merge: every /api/v1 path is still the unavailable seam (src/app/api/v1/[...path]/route.ts).
   * Keeping the real body here means the screen's current behaviour is asserted, not assumed.
   */
  const seamResponse = {
    trace_id: "a9f9ec90-4285-42cf-971c-4c725d62828a",
    decision: null,
    reasons: [],
    policy_version: null,
    feed_version: null,
    semantic: {
      status: "unavailable",
      scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
      checkpoint_revision: null,
      windows_planned: 0,
      windows_completed: 0,
      coverage_complete: false,
      text_sha256: null,
      coverage_ranges: [],
    },
    usage: {
      generation_input_tokens: 0,
      generation_output_tokens: 0,
      generation_ms: 0,
      semantic_input_tokens: 0,
      semantic_ms: 0,
      reserved_generation_tokens: 0,
      unresolved_reservation: false,
      comparison_micro_usd: 0,
      comparison_rate_version: "none",
    },
    timings: { total_ms: 0, deterministic_ms: 0, semantic_ms: 0, provider_ms: 0, persistence_ms: 0 },
    data: null,
    error: {
      code: "STATE_UNAVAILABLE",
      message: "This gateway operation is not available yet.",
      retryable: true,
    },
  };

  it("shows the unavailable-state screen rather than an empty or zeroed trace", () => {
    expect(classifyTraceRead(503, seamResponse).kind).toBe("stateUnavailable");
  });

  it("never reads the envelope root as the audited trace, even when the root is all zeros", () => {
    // The seam's zeros are true for the read itself. Rendering them as an audited operation
    // would claim a measurement that no audited operation produced.
    expect(readProjections(seamResponse)).toBeNull();
  });
});
