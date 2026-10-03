// @vitest-environment happy-dom
/*
 * AT10-5 against a real blocked trace.
 *
 * The body below was captured verbatim from `GET /api/v1/audit/{id}` with a signed-in session. It
 * is the prompt-injection attempt from Julian's second browser QA run
 * (`Julian/plans/06-browser-qa-results.md:242`), refused by the gateway at the input-signature
 * stage. Until now the only real trace this feature had seen was a withheld one whose values were
 * all zero and whose decision was null; this one carries a genuine BLOCK, a reason code and a
 * finding.
 *
 * Both halves are asserted, in the model and in the DOM: the injection attempt must not appear, and
 * the evidence that it was refused must.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageList } from "./components/StageList";
import { TraceSummary } from "./components/TraceSummary";
import { classifyTraceRead } from "./envelope";
import { decisionBadge, stageRows } from "./trace";

afterEach(cleanup);

const BLOCKED_READ = {
  // The read itself was allowed and has its own trace id; the audited operation was blocked.
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
        trace_id: "6c8d9cb0-286b-48bd-b75b-8330e39f6056",
        actor_id: "164a7c30-aa44-406d-a1c5-f7d784f0076d",
        operation: "chat_start",
        created_at: "2026-10-03T20:33:30.946135+00:00",
        decision: "BLOCK",
        reasons: ["input_signature:SIG-001"],
        state: "blocked",
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
            created_at: "2026-10-03T20:33:29.232856+00:00",
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
            created_at: "2026-10-03T20:33:30.609607+00:00",
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
            event_type: "decision",
            created_at: "2026-10-03T20:33:30.946135+00:00",
            policy_version: 1,
            feed_version: 1,
            findings: [
              {
                code: "SIG-001",
                stage: "input_signature",
                locator: null,
                category: "prompt_injection",
                severity: "block",
              },
            ],
            semantic: {
              scores: { resource_abuse: null, sensitive_exposure: null, instruction_manipulation: null },
              status: "not_required",
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
  trace_id: "118a7fb2-e837-4715-8eab-aa23a34d3dbe",
};

const blocked = () => {
  const state = classifyTraceRead(200, BLOCKED_READ);
  if (state.kind !== "ok") throw new Error(`expected a readable trace, got ${state.kind}`);
  return state;
};

const renderTrace = () => {
  const { trace, incomplete, cancelled, eventsCapped, serverMessage } = blocked();
  return render(
    <>
      <TraceSummary
        trace={trace}
        incomplete={incomplete}
        cancelled={cancelled}
        eventsCapped={eventsCapped}
        serverMessage={serverMessage}
      />
      <StageList rows={stageRows(trace.events)} />
    </>,
  ).container;
};

describe("the stored refusal", () => {
  it("is read from the record, not from the allowed read that fetched it", () => {
    expect(BLOCKED_READ.decision).toBe("ALLOW");
    expect(blocked().trace.decision).toBe("BLOCK");
    expect(blocked().trace.state).toBe("blocked");
  });

  it("names the decision without upgrading a refusal into a confirmed breach", () => {
    const badge = decisionBadge(blocked().trace.decision, blocked().trace.state);
    expect(badge.label).toBe("Blocked");
    expect(badge.tone).toBe("danger");
    expect(badge.hint).toBe("Blocked attempts are refused requests, not confirmed breaches.");
  });

  it("shows the finding by code and category, with no locator invented", () => {
    const rows = stageRows(blocked().trace.events);
    const [finding] = rows[2].findings;
    expect(finding.code).toBe("SIG-001");
    expect(finding.category).toBe("prompt_injection");
    expect(finding.severity).toBe("block");
    expect(finding.tone).toBe("danger");
    // The record stores locator: null. The screen says so rather than leaving an empty cell.
    expect(finding.locator).toBe("No locator");
  });

  it("orders the stages and measures the real gaps between them", () => {
    const rows = stageRows(blocked().trace.events);
    expect(rows.map((row) => row.stage)).toEqual(["chat_start", "run_execute", "input_signature"]);
    expect(rows.map((row) => row.eventType)).toEqual(["intent", "intent", "decision"]);
    expect(rows.map((row) => row.elapsed)).toEqual([null, "+1.4 s", "+337 ms"]);
  });

  it("reports nothing consumed, because the refusal happened before any provider call", () => {
    const { usage } = blocked().trace;
    expect(usage.generation_input_tokens).toBe(0);
    expect(usage.generation_ms).toBe(0);
    expect(usage.unresolved_reservation).toBe(false);
  });
});

describe("AT10-5 in the DOM, on the real refusal", () => {
  it("shows the decision, the reason code and the finding", () => {
    renderTrace();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("input_signature:SIG-001")).toBeTruthy();
    expect(screen.getByText("SIG-001")).toBeTruthy();
    expect(screen.getByText("prompt_injection")).toBeTruthy();
    expect(screen.getByText("No locator")).toBeTruthy();
  });

  it("states that a blocked attempt is not a confirmed breach", () => {
    renderTrace();
    expect(screen.getByText("Blocked attempts are refused requests, not confirmed breaches.")).toBeTruthy();
  });

  /*
   * The whole point of the refusal: the gateway stored the code, not the attempt.
   *
   * Rather than hunt for particular words — a first attempt failed on `instruction_manipulation`,
   * which is a contract field, not prose — this asserts the shape of what was stored. Every string
   * in the record is a token: an identifier, a code, an enum or a timestamp. Prose has spaces.
   * A payload with no sentence in it carries no injected instruction for a reader, or for a model
   * reading the page, to be steered by.
   */
  it("stores tokens and no prose, so there is no injected instruction to carry", () => {
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(BLOCKED_READ);

    expect(strings.length).toBeGreaterThan(20);
    const prose = strings.filter((value) => value.includes(" "));
    expect(prose).toEqual([]);
  });

  it("renders the refused attempt nowhere, since the record never carried it", () => {
    const page = renderTrace().textContent ?? "";
    // Everything on the page is either this feature's own copy or a token from the record above.
    expect(page).toContain("SIG-001");
    expect(page).not.toMatch(/ignore (all |previous )?instructions/i);
  });
});
