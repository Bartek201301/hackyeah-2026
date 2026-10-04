import { describe, expect, it } from "vitest";
import {
  canList,
  createVerdict,
  deleteVerdict,
  editVerdict,
  feeChangeVerdict,
  visibleClient,
  type ClientRole,
} from "./client-rules";

const ROLES: ClientRole[] = ["admin", "analyst", "employee", "external"];
const BLOCKED = { decision: "BLOCK", reasons: ["action:role_not_permitted"] };
const OVER = { decision: "REVIEW", reasons: ["action:change_exceeds_role_limit"] };
const decide = (role: ClientRole, current: number | null, next: number | null) =>
  feeChangeVerdict(role, current, next).decision;

describe("client rules", () => {
  it("applies role fee limits", () => {
    expect(decide("analyst", 100_000, 110_000)).toBe("ALLOW");
    expect(feeChangeVerdict("analyst", 100_000, 130_000)).toEqual(OVER);
    expect(decide("admin", 100_000, 130_000)).toBe("ALLOW");
    expect(decide("admin", 100_000, 300_000)).toBe("REVIEW");
    expect(decide("admin", 100_000, 40_000)).toBe("REVIEW");
    expect(decide("analyst", 100_000, 120_000)).toBe("ALLOW");
  });

  it("handles null, zero, unchanged and invalid fees", () => {
    expect(decide("analyst", null, 250_000)).toBe("ALLOW");
    expect(decide("admin", 0, 0)).toBe("ALLOW");
    expect(feeChangeVerdict("admin", 0, 1000)).toEqual(OVER);
    expect(decide("analyst", 100_000, null)).toBe("REVIEW");
    expect(decide("analyst", 100_000, 100_000)).toBe("ALLOW");
    expect(feeChangeVerdict("analyst", null, -5)).toEqual({
      decision: "BLOCK",
      reasons: ["action:invalid_fee"],
    });
    expect(decide("analyst", null, Number.NaN)).toBe("BLOCK");
  });

  it("blocks non-editors from fee and other edits", () => {
    for (const role of ["employee", "external"] as const) {
      expect(feeChangeVerdict(role, 100_000, 100_000)).toEqual(BLOCKED);
      expect(editVerdict(role, { annual_fee_usd: 100_000 }, { status: "active" })).toEqual(BLOCKED);
    }
  });

  it("routes only fee edits through the fee rule", () => {
    const current = { annual_fee_usd: 100_000 };
    expect(editVerdict("analyst", current, { notes: "x", sector: "Retail" }).decision).toBe("ALLOW");
    expect(editVerdict("analyst", current, { annual_fee_usd: 130_000 })).toEqual(OVER);
    expect(editVerdict("admin", current, { annual_fee_usd: 130_000, status: "paused" }).decision).toBe(
      "ALLOW",
    );
  });

  it("has the create, delete and list matrices", () => {
    expect(ROLES.map((r) => createVerdict(r).decision)).toEqual(["ALLOW", "ALLOW", "BLOCK", "BLOCK"]);
    expect(createVerdict("employee")).toEqual(BLOCKED);
    expect(deleteVerdict("admin")).toEqual({
      decision: "REVIEW",
      reasons: ["action:destructive_requires_approval"],
    });
    for (const role of ["analyst", "employee", "external"] as const)
      expect(deleteVerdict(role)).toEqual(BLOCKED);
    expect(ROLES.map(canList)).toEqual([true, true, true, false]);
  });

  it("projects rows by role", () => {
    const row = {
      id: "c1",
      name: "Fictional Orchard Labs",
      sector: "Agritech",
      status: "active",
      created_at: "2026-10-04T00:00:00Z",
      annual_fee_usd: 120_000,
      version: 3,
      notes: "renewal pending",
    };
    for (const role of ["employee", "external"] as const)
      expect(Object.keys(visibleClient(role, row)).sort()).toEqual([
        "created_at",
        "id",
        "name",
        "sector",
        "status",
      ]);
    expect(visibleClient("analyst", row)).toEqual(row);
    expect(visibleClient("admin", row)).toEqual(row);
  });
});
