/*
 * The displayed values checked against a real stored record.
 *
 * `docs/testing/acceptance.md:63` requires that dashboard numbers equal the stored usage for the
 * selected traces. This is that check: the body below was captured verbatim from
 * `GET /api/v1/audit/{id}` with a signed-in session, and every assertion states what the screen
 * renders for it. Nothing here is schema-derived or hand-written to fit.
 *
 * The trace is a chat whose required assessment was unavailable, so the gateway withheld the
 * result. The envelope root and the audited trace disagree on purpose, and that disagreement is
 * the first thing asserted.
 */
import { describe, expect, it } from "vitest";
import { classifyTraceRead } from "./envelope";
import { decisionBadge, groupStages, stageRows, usageView } from "./trace";
import { formatTimestampUtc, shortId } from "./format";

const LIVE_READ = {
  // The audit READ was allowed and is its own audited operation, with its own trace id.
  decision: "ALLOW",
  reasons: [],
  policy_version: null,
  feed_version: null,
  semantic: {
    status: "not_required",
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
  data: {
    items: [
      {
        trace_id: "ad393f2f-0e12-4170-b9e8-369530736bf4",
        actor_id: "6094272c-ea9f-4889-a3a1-1a9ac0d94ec0",
        operation: "chat_start",
        created_at: "2026-10-03T19:53:09.344599+00:00",
        decision: null,
        reasons: [],
        state: "failed",
        policy_version: 1,
        feed_version: 1,
        usage: {
          semantic_ms: 0,
          generation_ms: 0,
          comparison_micro_usd: 0,
          semantic_input_tokens: 0,
          unresolved_reservation: false,
          comparison_rate_version: "illustrative-v1",
          generation_input_tokens: 0,
          generation_output_tokens: 0,
          reserved_generation_tokens: 0,
        },
        events: [
          {
            event_type: "intent",
            created_at: "2026-10-03T19:53:08.046175+00:00",
            policy_version: 1,
            feed_version: 1,
            findings: [],
            semantic: {
              status: "not_required",
              scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
              checkpoint_revision: null,
              windows_planned: 0,
              windows_completed: 0,
              coverage_complete: false,
              text_sha256: null,
              coverage_ranges: [],
            },
            stage: "chat_start",
            usage: {
              generation_input_tokens: 0,
              generation_output_tokens: 0,
              generation_ms: 0,
              semantic_input_tokens: 0,
              semantic_ms: 0,
              reserved_generation_tokens: 0,
              unresolved_reservation: false,
              comparison_micro_usd: 0,
              comparison_rate_version: "illustrative-v1",
            },
          },
          {
            event_type: "intent",
            created_at: "2026-10-03T19:53:09.03942+00:00",
            policy_version: 1,
            feed_version: 1,
            findings: [],
            semantic: {
              status: "not_required",
              scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
              checkpoint_revision: null,
              windows_planned: 0,
              windows_completed: 0,
              coverage_complete: false,
              text_sha256: null,
              coverage_ranges: [],
            },
            stage: "run_execute",
            usage: {
              generation_input_tokens: 0,
              generation_output_tokens: 0,
              generation_ms: 0,
              semantic_input_tokens: 0,
              semantic_ms: 0,
              reserved_generation_tokens: 0,
              unresolved_reservation: false,
              comparison_micro_usd: 0,
              comparison_rate_version: "illustrative-v1",
            },
          },
          {
            event_type: "incomplete",
            created_at: "2026-10-03T19:53:09.344599+00:00",
            policy_version: 1,
            feed_version: 1,
            findings: [],
            semantic: {
              scores: { resource_abuse: null, sensitive_exposure: null, instruction_manipulation: null },
              status: "unavailable",
              text_sha256: null,
              coverage_ranges: [],
              windows_planned: 0,
              coverage_complete: false,
              windows_completed: 0,
              checkpoint_revision: null,
            },
            stage: "input_signature",
            usage: {
              semantic_ms: 0,
              generation_ms: 0,
              comparison_micro_usd: 0,
              semantic_input_tokens: 0,
              unresolved_reservation: false,
              comparison_rate_version: "illustrative-v1",
              generation_input_tokens: 0,
              generation_output_tokens: 0,
              reserved_generation_tokens: 0,
            },
          },
        ],
      },
    ],
  },
  error: null,
  trace_id: "0540d652-0221-4b3b-8307-d759cd9a0a7f",
};

const read = () => {
  const state = classifyTraceRead(200, LIVE_READ);
  if (state.kind !== "ok") throw new Error(`expected a readable trace, got ${state.kind}`);
  return state;
};

describe("the envelope root is not the audited trace", () => {
  it("shows the audited operation, not the read that fetched it", () => {
    const { trace } = read();
    // The read was ALLOW and carries its own trace id; the audited operation decided nothing.
    expect(LIVE_READ.decision).toBe("ALLOW");
    expect(LIVE_READ.trace_id).toBe("0540d652-0221-4b3b-8307-d759cd9a0a7f");
    expect(trace.decision).toBeNull();
    expect(trace.trace_id).toBe("ad393f2f-0e12-4170-b9e8-369530736bf4");
    expect(trace.state).toBe("failed");
  });

  it("never renders the read's decision as the operation's", () => {
    const badge = decisionBadge(read().trace.decision, read().trace.state);
    expect(badge.label).not.toBe("Allowed");
    expect(badge.label).toBe("No decision recorded");
    expect(badge.tone).toBe("warning");
  });

  it("does not take the rate version from the root either", () => {
    // The root says "none"; the audited record says "illustrative-v1". The screen reads the record.
    expect(LIVE_READ.usage.comparison_rate_version).toBe("none");
    expect(read().trace.usage.comparison_rate_version).toBe("illustrative-v1");
  });
});

describe("every displayed value equals the stored record", () => {
  it("renders the identifiers and the version pair exactly as stored", () => {
    const { trace } = read();
    expect(shortId(trace.trace_id)).toBe("ad393f2f…6bf4");
    expect(shortId(trace.actor_id)).toBe("6094272c…4ec0");
    expect(trace.operation).toBe("chat_start");
    expect(trace.policy_version).toBe(1);
    expect(trace.feed_version).toBe(1);
    expect(formatTimestampUtc(trace.created_at)).toBe("2026-10-03 19:53:09 UTC");
  });

  it("renders the stored usage as measured zeros, with nothing unknown and nothing reserved", () => {
    const view = usageView(read().trace.usage);
    expect(view.actual).toEqual([
      { label: "Generation input", value: "0 tokens" },
      { label: "Generation output", value: "0 tokens" },
      { label: "Generation duration", value: "0 ms" },
      { label: "Assessment input (Laya)", value: "0 tokens" },
      { label: "Assessment duration (Laya)", value: "0 ms" },
    ]);
    expect(view.unknown).toEqual([]);
    expect(view.reserved).toEqual([{ label: "Reserved generation tokens", value: "0 tokens" }]);
    expect(view.hasReservation).toBe(false);
    expect(view.unresolvedReservation).toBe(false);
  });

  it("orders the three stages by stored time and reports the gaps between them", () => {
    const rows = stageRows(read().trace.events);
    expect(rows.map((row) => row.stage)).toEqual(["chat_start", "run_execute", "input_signature"]);
    expect(rows.map((row) => row.when)).toEqual([
      "2026-10-03 19:53:08 UTC",
      "2026-10-03 19:53:09 UTC",
      "2026-10-03 19:53:09 UTC",
    ]);
    expect(rows.map((row) => row.elapsed)).toEqual([null, "+993 ms", "+305 ms"]);
    expect(rows.every((row) => !row.isSubcall)).toBe(true);
    expect(groupStages(rows).map((group) => group.kind)).toEqual(["stage", "stage", "stage"]);
  });

  it("keeps the version badges unmarked, because no version changed during the operation", () => {
    const rows = stageRows(read().trace.events);
    expect(rows.every((row) => !row.policyChanged && !row.feedChanged)).toBe(true);
  });

  it("names the assessment outcome per stage and warns about coverage on none of them", () => {
    const rows = stageRows(read().trace.events);
    expect(rows.map((row) => row.assessment.statusLabel)).toEqual([
      "Assessment not required",
      "Assessment not required",
      "Assessment unavailable",
    ]);
    // Every stage reports coverage_complete: false with zero planned windows. Warning on that would
    // be a false alarm; the unavailable status is the real signal and it is shown.
    expect(rows.every((row) => row.assessment.coverageWarning === null)).toBe(true);
    expect(rows.map((row) => row.assessment.measured)).toEqual([false, false, true]);
    expect(rows[2].assessment.statusHint).toBe(
      "Required assessment did not complete; the operation was withheld.",
    );
  });

  it("reports no findings, because the record holds none", () => {
    expect(stageRows(read().trace.events).every((row) => row.findings.length === 0)).toBe(true);
  });

  it("is not treated as incomplete or capped, since the record says neither", () => {
    expect(read()).toMatchObject({ incomplete: false, cancelled: false, eventsCapped: false });
    expect(read().serverMessage).toBeNull();
  });
});

describe("what the record does not contain", () => {
  it("carries no prompt, answer, title or excerpt for a screen to leak", () => {
    const serialised = JSON.stringify(LIVE_READ);
    for (const field of ["prompt", "answer", "question", "excerpt", "document_title", "citations"]) {
      expect(serialised, field).not.toContain(`"${field}"`);
    }
  });
});
