import { describe, expect, it } from "vitest";
import {
  assessmentView,
  decisionBadge,
  findingRows,
  groupStages,
  isToolSubcall,
  stageRows,
  usageView,
} from "./trace";
import { assessment, auditEvent, usage } from "./test-support";

describe("decision badge", () => {
  it("names every decision without softening a refusal", () => {
    expect(decisionBadge("ALLOW")).toMatchObject({ label: "Allowed", tone: "success" });
    expect(decisionBadge("REDACT")).toMatchObject({ label: "Partly withheld", tone: "warning" });
    expect(decisionBadge("REVIEW")).toMatchObject({ label: "Held for review", tone: "warning" });
    expect(decisionBadge("BLOCK")).toMatchObject({ label: "Blocked", tone: "danger" });
  });

  it("reads a missing decision as pending, never as allowed", () => {
    const badge = decisionBadge(null);
    expect(badge.label).toBe("Pending");
    expect(badge.tone).toBe("neutral");
    expect(badge.hint).toBe("No decision recorded yet.");
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
