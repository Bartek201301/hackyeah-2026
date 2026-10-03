// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

it("renders title and description into the DOM", () => {
  render(<EmptyState title="No traces yet" description="Ask a question first." />);
  expect(screen.getByRole("heading", { name: "No traces yet" })).toBeTruthy();
  expect(screen.getByText("Ask a question first.")).toBeTruthy();
});
