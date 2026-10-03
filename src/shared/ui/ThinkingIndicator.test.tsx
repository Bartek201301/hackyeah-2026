// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ThinkingIndicator } from "./ThinkingIndicator";

afterEach(cleanup);

it("announces only the caller's label and detail; the animation is hidden from assistive tech", () => {
  const { container } = render(
    <ThinkingIndicator label="Searching permitted sources" detail="2 of 3 checked" />,
  );
  const status = screen.getByRole("status");
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.textContent).toBe("Searching permitted sources2 of 3 checked");
  expect(container.firstElementChild?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
});

it("renders without a detail line", () => {
  render(<ThinkingIndicator label="Checking your request" />);
  expect(screen.getByRole("status").textContent).toBe("Checking your request");
});
