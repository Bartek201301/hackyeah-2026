import { describe, expect, it } from "vitest";
import {
  assessmentView,
  decisionBadge,
  findingRows,
  groupStages,
  isToolSubcall,
  stageRows,
  usageView,
  whatHappened,
} from "./trace";
import { assessment, auditEvent, projection, usage } from "./test-support";

describe("decision badge", () => {
  it("names every decision without softening a refusal", () => {
    expect(decisionBadge("ALLOW")).toMatchObject({ label: "Allowed", tone: "success" });
    expect(decisionBadge("REDACT")).toMatchObject({ label: "Partly withheld", tone: "warning" });
    expect(decisionBadge("REVIEW")).toMatchObject({ label: "Held for review", tone: "warning" });
    expect(decisionBadge("BLOCK")).toMatchObject({ label: "Blocked", tone: "danger" });
  });

  it("reads a missing decision as pending only while the operation is still running", () => {
    const badge = decisionBadge(null, "running");
    expect(badge.label).toBe("Pending");
    expect(badge.tone).toBe("neutral");
    expect(badge.hint).toBe("No decision recorded yet.");
    expect(decisionBadge(null, "queued").label).toBe("Pending");
  });

  /*
   * Observed against the real gateway: a withheld chat was stored with decision null and
   * state "failed". Calling that "Pending" tells the reader to wait for a decision that will never
   * arrive, which is the same class of error as rendering an unknown value as zero.
   */
  it("does not call a finished operation pending when no decision was stored", () => {
    const badge = decisionBadge(null, "failed");
    expect(badge.label).toBe("No decision recorded");
    expect(badge.tone).toBe("warning");
    expect(badge.hint).toBe(
      "The operation did not complete, so no decision was stored and no result was released.",
    );
    expect(decisionBadge(null, "cancelled").label).toBe("No decision recorded");
    expect(decisionBadge(null, "incomplete").label).toBe("No decision recorded");
  });

  it("claims nothing about completion when no state is known", () => {
    const badge = decisionBadge(null);
    expect(badge.label).toBe("No decision recorded");
    expect(badge.tone).toBe("neutral");
    expect(badge.hint).toBe("No decision recorded yet.");
  });

  it("never reads a missing decision as allowed, whatever the state", () => {
    for (const state of [undefined, "running", "failed", "complete", "nonsense"]) {
      expect(decisionBadge(null, state).label).not.toBe("Allowed");
    }
  });

  it("states that a block is a refused request, not a confirmed breach", () => {
    expect(decisionBadge("BLOCK").hint).toBe(
      "Blocked attempts are refused requests, not confirmed breaches.",
    );
  });
});

describe("resource use", () => {
  it("keeps actual, reserved and unknown apart, and never adds a reservation to actual", () => {
    const view = usageView(usage());
    expect(view.actual.map((row) => row.label)).toEqual([
      "Generation input",
      "Generation output",
      "Generation duration",
      "Assessment input (Laya)",
      "Assessment duration (Laya)",
    ]);
    expect(view.unknown).toEqual([]);
    expect(view.reserved).toEqual([{ label: "Reserved generation tokens", value: "4,096 tokens" }]);
    expect(view.actual.some((row) => row.value.includes("4,096"))).toBe(false);
    expect(view.hasReservation).toBe(true);
  });

  /*
   * Observed against the real gateway: a withheld chat reserved nothing, and the screen still said
   * "Retained until the reservation is reconciled" beside `0 tokens` — describing a retention that
   * was not happening.
   */
  it("does not claim a retention when nothing is reserved", () => {
    const none = usageView(usage({ reserved_generation_tokens: 0, unresolved_reservation: false }));
    expect(none.hasReservation).toBe(false);
    expect(none.reservedHint).toBe("No reservation was recorded for this operation.");
    const unresolved = usageView(usage({ reserved_generation_tokens: 0, unresolved_reservation: true }));
    expect(unresolved.hasReservation).toBe(true);
    expect(unresolved.reservedHint).toContain("not reconciled");
  });

  /*
   * Observed against the real gateway: one settled run records 2,200 reserved tokens while the
   * dashboard for that same UTC day reports 0 outstanding. Both numbers are right and they are the
   * same contract field, so the caption has to say which of the two it is.
   */
  it("says whether a reserved figure is one operation's or a window's outstanding total", () => {
    const settled = usage({ reserved_generation_tokens: 2200, unresolved_reservation: false });
    expect(usageView(settled, "operation").reservedHint).toBe(
      "Reserved for this operation. A reservation is never added to actual use.",
    );
    expect(usageView(settled, "window").reservedHint).toBe(
      "Still outstanding in this window. Never added to actual use.",
    );
    // Neither caption claims a retention; only an unresolved reservation does, in both meanings.
    for (const means of ["operation", "window"] as const) {
      expect(usageView(settled, means).reservedHint).not.toContain("Retained");
      expect(usageView({ ...settled, unresolved_reservation: true }, means).reservedHint).toContain(
        "Retained",
      );
    }
  });

  it("reports an empty window as nothing outstanding, not as nothing recorded", () => {
    const quiet = usage({ reserved_generation_tokens: 0, unresolved_reservation: false });
    expect(usageView(quiet, "window").reservedHint).toBe("No reservation is outstanding.");
  });

  it("separates generation from the Laya assessment instead of merging them", () => {
    const view = usageView(usage({ generation_input_tokens: 1842, semantic_input_tokens: 2048 }));
    const generation = view.actual.find((row) => row.label === "Generation input");
    const semantic = view.actual.find((row) => row.label === "Assessment input (Laya)");
    expect(generation?.value).toBe("1,842 tokens");
    expect(semantic?.value).toBe("2,048 tokens");
  });

  it("moves each null measurement into the unknown group as Not measured", () => {
    const view = usageView(
      usage({
        generation_input_tokens: null,
        generation_output_tokens: null,
        generation_ms: null,
        semantic_input_tokens: null,
        unresolved_reservation: true,
      }),
    );
    expect(view.unknown).toEqual([
      { label: "Generation input", value: "Not measured" },
      { label: "Generation output", value: "Not measured" },
      { label: "Generation duration", value: "Not measured" },
      { label: "Assessment input (Laya)", value: "Not measured" },
    ]);
    expect(view.unknown.some((row) => row.value === "0" || row.value === "0 tokens")).toBe(false);
    expect(view.unresolvedReservation).toBe(true);
    // The one duration the contract never leaves null stays measured.
    expect(view.actual).toEqual([{ label: "Assessment duration (Laya)", value: "486 ms" }]);
  });

  it("shows a proven zero as zero, because nothing executed is a measurement", () => {
    const view = usageView(
      usage({ generation_input_tokens: 0, generation_output_tokens: 0, generation_ms: 0 }),
    );
    expect(view.unknown).toEqual([]);
    expect(view.actual[0]).toEqual({ label: "Generation input", value: "0 tokens" });
  });
});

describe("assessment", () => {
  it("presents neither an unavailable nor a not-required assessment as a pass", () => {
    const unavailable = assessmentView(assessment({ status: "unavailable" }));
    expect(unavailable.statusLabel).toBe("Assessment unavailable");
    expect(unavailable.statusTone).toBe("danger");
    expect(unavailable.statusHint).toBe("Required assessment did not complete; the operation was withheld.");

    const notRequired = assessmentView(assessment({ status: "not_required" }));
    expect(notRequired.statusTone).toBe("neutral");
    expect(notRequired.statusHint).toContain("not a pass");
  });

  it("warns prominently when coverage is incomplete, with the window counts", () => {
    const view = assessmentView(
      assessment({ coverage_complete: false, windows_completed: 2, windows_planned: 3 }),
    );
    expect(view.coverageComplete).toBe(false);
    expect(view.coverageWarning).toBe("Coverage incomplete: 2 of 3 windows assessed.");
    expect(view.windows).toBe("2 / 3");
  });

  /*
   * Observed against the real gateway: every stage of a withheld chat carried
   * coverage_complete: false with windows_planned: 0, so the screen shouted
   * "Coverage incomplete: 0 of 0 windows assessed." on stages where no assessment was ever required.
   * A warning about partial coverage needs something to have been planned.
   */
  it("does not warn about coverage when no window was ever planned", () => {
    const notRun = assessment({
      status: "not_required",
      coverage_complete: false,
      windows_planned: 0,
      windows_completed: 0,
    });
    const view = assessmentView(notRun);
    expect(view.coverageWarning).toBeNull();
    // The status still says plainly that this is not a pass.
    expect(view.statusLabel).toBe("Assessment not required");
    expect(view.statusHint).toContain("not a pass");
  });

  it("still warns when windows were planned and not completed, even at zero completed", () => {
    const view = assessmentView(
      assessment({ coverage_complete: false, windows_planned: 4, windows_completed: 0 }),
    );
    expect(view.coverageWarning).toBe("Coverage incomplete: 0 of 4 windows assessed.");
  });

  it("marks a not-required assessment as unmeasured so no scores are displayed", () => {
    expect(assessmentView(assessment({ status: "not_required" })).measured).toBe(false);
    expect(assessmentView(assessment({ status: "unavailable" })).measured).toBe(true);
    expect(assessmentView(assessment()).measured).toBe(true);
  });

  it("marks unmeasured scores and never fills them with zero", () => {
    const view = assessmentView(
      assessment({
        status: "unavailable",
        scores: { instruction_manipulation: null, sensitive_exposure: null, resource_abuse: null },
        checkpoint_revision: null,
        text_sha256: null,
        coverage_ranges: [],
      }),
    );
    expect(view.scores.map((row) => row.value)).toEqual(["Not measured", "Not measured", "Not measured"]);
    expect(view.revision).toBe("Revision not reported");
    expect(view.hash).toBe("No hash recorded");
    expect(view.ranges).toBe("0 · 0 tokens");
  });

  it("summarises coverage ranges as a count and assessed tokens, not as offsets", () => {
    expect(assessmentView(assessment()).ranges).toBe("2 · 2,048 tokens");
  });
});

describe("findings", () => {
  it("shows code, category, severity and locator, and adds no value field", () => {
    const rows = findingRows([
      {
        code: "RESTRICTED_SOURCE",
        category: "access",
        severity: "block",
        stage: "retrieval",
        locator: "row:14",
      },
      {
        code: "INSTRUCTION_PATTERN",
        category: "manipulation",
        severity: "review",
        stage: "input",
        locator: null,
      },
    ]);
    expect(rows[0]).toEqual({
      code: "RESTRICTED_SOURCE",
      category: "access",
      severity: "block",
      stage: "retrieval",
      locator: "row:14",
      tone: "danger",
    });
    expect(rows[1].locator).toBe("No locator");
    expect(rows[1].tone).toBe("warning");
    expect(Object.keys(rows[0])).not.toContain("value");
  });
});

describe("stages", () => {
  const first = auditEvent({ created_at: "2026-10-03T09:41:07.000Z", stage: "input_assessment" });
  const second = auditEvent({
    created_at: "2026-10-03T09:41:14.120Z",
    stage: "generation",
    event_type: "completion",
    policy_version: 8,
  });

  it("orders stages by recorded time, whatever order they arrive in", () => {
    const rows = stageRows([second, first]);
    expect(rows.map((row) => row.stage)).toEqual(["input_assessment", "generation"]);
  });

  it("reports elapsed time per stage and does not sum overlapping spans", () => {
    const rows = stageRows([first, second]);
    expect(rows[0].elapsed).toBeNull();
    expect(rows[1].elapsed).toBe("+7.1 s");
    expect(rows[1].usage.actual.find((row) => row.label === "Generation duration")?.value).toBe("7.1 s");
  });

  it("marks a policy or feed version change between stages, which is the version evidence", () => {
    const rows = stageRows([first, second]);
    expect(rows[0].policyChanged).toBe(false);
    expect(rows[1].policyChanged).toBe(true);
    expect(rows[1].feedChanged).toBe(false);
  });

  // P05 on a real S07 trace: the settled stage had null generation tokens, the root had 385/119.
  it("points a stage's missing value to the request total instead of calling it not measured", () => {
    const stage = auditEvent({
      stage: "ollama:settled",
      usage: usage({ generation_input_tokens: null, generation_output_tokens: 120, generation_ms: null }),
    });
    const root = usage({ generation_input_tokens: 385, generation_output_tokens: 119, generation_ms: null });
    const [row] = stageRows([stage], root);
    const value = (label: string) => row.usage.actual.find((entry) => entry.label === label)?.value;

    expect(value("Generation input")).toBe("Shown on the request total");
    expect(value("Generation output")).toBe("120 tokens");
    // Missing on both the stage and the request: still honestly unknown.
    expect(row.usage.unknown.map((entry) => entry.label)).toContain("Generation duration");
    expect(row.usage.unknown.map((entry) => entry.label)).not.toContain("Generation input");
  });

  it("returns nothing when the projection carries no events", () => {
    expect(stageRows(undefined)).toEqual([]);
    expect(stageRows([])).toEqual([]);
  });
});

describe("root requests versus tool subcalls", () => {
  const at = (second: number, stage: string) =>
    auditEvent({ created_at: `2026-10-03T09:41:${String(second).padStart(2, "0")}.000Z`, stage });

  it("recognises the registered tools as subcalls and everything else as a root stage", () => {
    expect(isToolSubcall("tool.search_excerpts")).toBe(true);
    expect(isToolSubcall("read_excerpt")).toBe(true);
    expect(isToolSubcall("generation")).toBe(false);
    expect(isToolSubcall("input_assessment")).toBe(false);
  });

  it("marks each stage so a subcall can never be counted as a request", () => {
    const rows = stageRows([at(7, "input_assessment"), at(8, "tool.search_excerpts")]);
    expect(rows.map((row) => row.isSubcall)).toEqual([false, true]);
  });

  it("folds consecutive subcalls into one group and keeps the stored order", () => {
    const rows = stageRows([
      at(7, "input_assessment"),
      at(8, "tool.search_excerpts"),
      at(9, "tool.read_excerpt"),
      at(10, "generation"),
    ]);
    const groups = groupStages(rows);
    expect(groups.map((group) => group.kind)).toEqual(["stage", "subcalls", "stage"]);
    const [, subcalls] = groups;
    if (subcalls.kind !== "subcalls") throw new Error("expected a subcall group");
    expect(subcalls.rows.map((row) => row.stage)).toEqual(["tool.search_excerpts", "tool.read_excerpt"]);
    expect(groups.filter((group) => group.kind === "stage")).toHaveLength(2);
  });

  it("starts a new group when a root stage separates two runs of subcalls", () => {
    const rows = stageRows([at(7, "tool.search_excerpts"), at(8, "generation"), at(9, "tool.read_excerpt")]);
    expect(groupStages(rows).map((group) => group.kind)).toEqual(["subcalls", "stage", "subcalls"]);
  });

  it("groups nothing when there are no subcalls", () => {
    const rows = stageRows([at(7, "input_assessment"), at(8, "generation")]);
    expect(groupStages(rows).every((group) => group.kind === "stage")).toBe(true);
  });
});

describe("what happened", () => {
  const decisionAt = (stage: string) => [
    auditEvent({ stage: "chat_start", event_type: "intent" }),
    auditEvent({ stage, event_type: "decision" }),
  ];

  it("says an allowed operation was released, with its measured use", () => {
    expect(whatHappened(projection({ operation: "chat_start" }))).toBe(
      "Question: passed every check and was released. Generation time: 7.1 s. Generation tokens: 2,393.",
    );
  });

  it("says not measured, never zero, when the use is unknown", () => {
    const unknown = usage({ generation_ms: null, generation_output_tokens: null });
    expect(whatHappened(projection({ usage: unknown }))).toMatch(
      /Generation time: not measured\. Generation tokens: not measured\.$/,
    );
  });

  it("names the first reason for a held operation and that nothing was written", () => {
    expect(
      whatHappened(
        projection({
          operation: "action_start",
          decision: "REVIEW",
          reasons: ["action:change_exceeds_role_limit"],
        }),
      ),
    ).toBe(
      "Client action from chat held for a person to decide: Change exceeds this role's approval limit. Nothing was released or written.",
    );
  });

  it("names the stage of the last decision event for a refusal", () => {
    expect(
      whatHappened(
        projection({
          operation: "chat_start",
          decision: "BLOCK",
          reasons: ["input_signature:SIG-001", "semantic:instruction_manipulation"],
          events: decisionAt("input_signature"),
        }),
      ),
    ).toBe(
      "Question refused at the known-pattern check on the question: Known prompt-injection pattern (SIG-001). Nothing was released or written.",
    );
    expect(whatHappened(projection({ decision: "BLOCK", reasons: [] }))).toBe(
      "chat_answer refused. Nothing was released or written.",
    );
  });

  it("is honest about a missing decision", () => {
    expect(whatHappened(projection({ decision: null, state: "running" }))).toBe(
      "chat_answer is still running; no decision is recorded yet.",
    );
    expect(whatHappened(projection({ decision: null, state: "failed" }))).toBe(
      "chat_answer did not complete, so no decision was stored and no result was released.",
    );
    expect(whatHappened(projection({ decision: null, state: "cancelled" }))).toMatch(/was cancelled/);
  });
});
