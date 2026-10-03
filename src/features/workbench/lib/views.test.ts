import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, VIEW_DESCRIPTIONS, VIEW_LABELS, WORKBENCH_VIEWS, parseView, viewHref } from "./views";

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
