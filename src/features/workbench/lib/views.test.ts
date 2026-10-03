import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_VIEWS,
  DEFAULT_VIEW,
  VIEW_DESCRIPTIONS,
  VIEW_LABELS,
  WORKBENCH_VIEWS,
  isAdminOnlyView,
  parseView,
  resolveView,
  shouldShowAdminViews,
  viewHref,
} from "./views";

describe("parseView", () => {
  it("accepts every known view", () => {
    for (const view of WORKBENCH_VIEWS) {
      expect(parseView(view)).toBe(view);
    }
  });

  it("falls back to chat for anything unrecognised", () => {
    for (const raw of [undefined, "", "nope", "CHAT", "../policy", "chat "] as const) {
      expect(parseView(raw)).toBe(DEFAULT_VIEW);
    }
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseView(["policy", "chat"])).toBe("policy");
    expect(parseView(["bogus", "policy"])).toBe(DEFAULT_VIEW);
    expect(parseView([])).toBe(DEFAULT_VIEW);
  });
});

describe("viewHref", () => {
  it("gives chat the bare path", () => {
    expect(viewHref("chat")).toBe("/workbench");
  });

  it("names every other view in the query", () => {
    expect(viewHref("sources")).toBe("/workbench?view=sources");
    expect(viewHref("policy")).toBe("/workbench?view=policy");
  });

  it("round-trips through parseView", () => {
    for (const view of WORKBENCH_VIEWS) {
      const query = new URL(viewHref(view), "https://example.invalid").searchParams.get("view");
      expect(parseView(query ?? undefined)).toBe(view);
    }
  });
});

describe("view copy", () => {
  it("labels and describes every view in English", () => {
    for (const view of WORKBENCH_VIEWS) {
      expect(VIEW_LABELS[view]).toBeTruthy();
      expect(VIEW_DESCRIPTIONS[view]).toBeTruthy();
      expect(VIEW_DESCRIPTIONS[view]).not.toMatch(/[ąćęłńóśźż]/i);
    }
  });
});

describe("admin-only views", () => {
  it("marks review and policy as admin-only and nothing else", () => {
    expect([...ADMIN_ONLY_VIEWS].sort()).toEqual(["policy", "review"]);
    for (const view of WORKBENCH_VIEWS) {
      expect(isAdminOnlyView(view)).toBe(view === "review" || view === "policy");
    }
  });

  it("never marks the default view admin-only, so chat is always reachable", () => {
    expect(isAdminOnlyView(DEFAULT_VIEW)).toBe(false);
  });
});

describe("shouldShowAdminViews", () => {
  it("shows admin links to an admin only", () => {
    expect(shouldShowAdminViews("admin")).toBe(true);
    for (const role of ["analyst", "employee", "external"] as const) {
      expect(shouldShowAdminViews(role)).toBe(false);
    }
  });

  it("shows everything when the role was not passed, rather than hiding controls", () => {
    expect(shouldShowAdminViews(undefined)).toBe(true);
  });
});

describe("resolveView", () => {
  it("sends a non-admin asking for an admin-only view back to the default view", () => {
    for (const role of ["analyst", "employee", "external"] as const) {
      for (const view of ADMIN_ONLY_VIEWS) {
        expect(resolveView(view, role)).toBe(DEFAULT_VIEW);
      }
    }
  });

  it("leaves every non-admin view exactly as requested", () => {
    for (const role of ["analyst", "employee", "external", "admin"] as const) {
      for (const view of WORKBENCH_VIEWS.filter((v) => !isAdminOnlyView(v))) {
        expect(resolveView(view, role)).toBe(view);
      }
    }
  });

  it("gives an administrator the admin-only view they asked for", () => {
    for (const view of ADMIN_ONLY_VIEWS) {
      expect(resolveView(view, "admin")).toBe(view);
    }
  });

  it("keeps every view when the role was not passed", () => {
    // Same rule as shouldShowAdminViews: a missing prop must not strip an administrator's controls.
    for (const view of WORKBENCH_VIEWS) {
      expect(resolveView(view, undefined)).toBe(view);
    }
  });

  it("is presentation only — it never stands in for the gateway check", () => {
    // Documented as a guard against re-reading this as access control: the admin endpoints answer
    // 403 to these roles regardless of which view the shell happens to render.
    expect(resolveView("policy", "analyst")).toBe(DEFAULT_VIEW);
    expect(isAdminOnlyView(DEFAULT_VIEW)).toBe(false);
  });
});
