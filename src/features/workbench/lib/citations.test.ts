import { describe, expect, it } from "vitest";
import { checkCitations, formatCitation } from "./citations";
import { devCitation } from "./fixtures";

const PERMITTED = "00000000-0000-4000-8000-000000001201";
const OTHER = "00000000-0000-4000-8000-000000001207";

describe("formatCitation", () => {
  it("shows label, period, date, locator and excerpt version", () => {
    expect(formatCitation(devCitation())).toBe(
      "AsterCloud public annual report — FY2025 (2026-03-15) · row 4 · v1",
    );
  });

  it("keeps the version visible, because two versions are not interchangeable", () => {
    expect(formatCitation(devCitation({ excerpt_version: 3 }))).toMatch(/v3$/);
  });
});

describe("checkCitations", () => {
  it("accepts a citation inside the permitted set", () => {
    const out = checkCitations([devCitation()], [PERMITTED]);
    expect(out.accepted).toHaveLength(1);
    expect(out.hasRejected).toBe(false);
  });

  it("rejects an invented excerpt id", () => {
    const out = checkCitations([devCitation({ excerpt_id: OTHER })], [PERMITTED]);
    expect(out.accepted).toHaveLength(0);
    expect(out.rejected).toHaveLength(1);
    expect(out.hasRejected).toBe(true);
  });

  it("fails closed when the response carried no permitted set", () => {
    const out = checkCitations([devCitation()], null);
    expect(out.accepted).toHaveLength(0);
    expect(out.hasRejected).toBe(true);
  });

  it("rejects everything against an empty permitted set", () => {
    expect(checkCitations([devCitation()], []).accepted).toHaveLength(0);
  });

  it("de-duplicates the same excerpt version but keeps distinct versions", () => {
    const out = checkCitations([devCitation(), devCitation()], [PERMITTED]);
    expect(out.accepted).toHaveLength(1);

    const twoVersions = checkCitations(
      [devCitation({ excerpt_version: 1 }), devCitation({ excerpt_version: 2 })],
      [PERMITTED],
    );
    expect(twoVersions.accepted).toHaveLength(2);
  });

  it("rejects malformed citations even when the id is permitted", () => {
    const cases = [
      devCitation({ excerpt_version: 0 }),
      devCitation({ excerpt_version: 1.5 }),
      devCitation({ source_label: "" }),
      devCitation({ locator: "" }),
      devCitation({ excerpt_id: "" }),
    ];
    for (const c of cases) {
      const out = checkCitations([c], [PERMITTED, ""]);
      expect(out.accepted, formatCitation(c)).toHaveLength(0);
    }
  });

  it("partitions a mixed list and reports that something was rejected", () => {
    const out = checkCitations(
      [devCitation(), devCitation({ excerpt_id: OTHER, locator: "row 9" })],
      [PERMITTED],
    );
    expect(out.accepted).toHaveLength(1);
    expect(out.rejected).toHaveLength(1);
    expect(out.hasRejected).toBe(true);
  });

  it("handles an empty citation list", () => {
    const out = checkCitations([], [PERMITTED]);
    expect(out.accepted).toEqual([]);
    expect(out.hasRejected).toBe(false);
  });
});
