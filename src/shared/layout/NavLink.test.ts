import { describe, expect, it } from "vitest";
import { isNavActive } from "./NavLink";

describe("isNavActive", () => {
  it("matches the default workbench view only without a view or with chat", () => {
    expect(isNavActive("/workbench", "/workbench", null)).toBe(true);
    expect(isNavActive("/workbench", "/workbench", "chat")).toBe(true);
    expect(isNavActive("/workbench", "/workbench", "sources")).toBe(false);
  });

  it("matches query-parameter views exactly", () => {
    expect(isNavActive("/workbench?view=sources", "/workbench", "sources")).toBe(true);
    expect(isNavActive("/workbench?view=sources", "/workbench", null)).toBe(false);
    expect(isNavActive("/workbench?view=review", "/audit", "review")).toBe(false);
  });

  it("matches sub-paths but not prefixes of other words", () => {
    expect(isNavActive("/audit", "/audit", null)).toBe(true);
    expect(isNavActive("/audit", "/audit/x", null)).toBe(true);
    expect(isNavActive("/audit", "/auditor", null)).toBe(false);
  });
});
