// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkbenchNav } from "./WorkbenchNav";

/*
 * Link visibility is presentation, never authorization — the gateway checks every call regardless.
 * These tests pin the presentation anyway, because B21 shipped the role prop and a silent
 * regression would put admin-only links in front of an employee during the demo.
 */

afterEach(cleanup);

const names = () => screen.getAllByRole("link").map((link) => link.textContent);

describe("WorkbenchNav", () => {
  it("shows every view to an administrator", () => {
    render(<WorkbenchNav active="chat" showAdminViews />);
    expect(names()).toEqual(["Ask", "Sources and import", "Review", "Policy and feed", "Public summary"]);
  });

  it("hides the admin-only views from everyone else", () => {
    render(<WorkbenchNav active="chat" showAdminViews={false} />);
    expect(names()).toEqual(["Ask", "Sources and import", "Public summary"]);
  });

  it("keeps the active view reachable even when it is admin-only", () => {
    // A direct link to ?view=review must not render a nav that omits the page you are on.
    render(<WorkbenchNav active="review" showAdminViews={false} />);
    expect(names()).toEqual(["Ask", "Sources and import", "Review", "Public summary"]);
  });

  it("marks the active view with aria-current, not colour alone", () => {
    render(<WorkbenchNav active="sources" showAdminViews />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["Sources and import"]);
  });

  it("links the canonical view to the bare path", () => {
    render(<WorkbenchNav active="chat" showAdminViews />);
    expect(screen.getByRole("link", { name: "Ask" }).getAttribute("href")).toBe("/workbench");
    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/workbench?view=review");
  });
});
