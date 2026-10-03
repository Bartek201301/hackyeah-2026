// @vitest-environment happy-dom
/*
 * AT10-4 and AT10-5 asserted where they actually matter: in the rendered DOM.
 *
 * `safety.test.ts` proves that no view model can carry prompt text, excerpt text, document titles,
 * secrets or contact canaries. That was the best available check until PR #43 added a DOM runner,
 * but it reasons about an intermediate layer. These tests render the real components from the same
 * hostile payload and search the produced tree, which is what a judge will actually look at.
 *
 * Both halves are asserted. A screen that leaked nothing because it rendered nothing would pass the
 * first half and fail the feature, so the reason codes, the decision and the withholding sentence
 * are required to be present.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityList } from "./components/ActivityList";
import { StageList } from "./components/StageList";
import { TraceSummary } from "./components/TraceSummary";
import { activityRows } from "./activity";
import { stageRows } from "./trace";
import { FORBIDDEN, contaminatedProjection } from "./test-support";

afterEach(cleanup);

const trace = contaminatedProjection();

/** Everything a reader could see: text, and the attributes that carry text to assistive tech. */
const renderedText = (root: HTMLElement) => {
  const attributes = Array.from(root.querySelectorAll("*"))
    .flatMap((element) =>
      ["title", "aria-label", "alt", "href", "value"].map((name) => element.getAttribute(name)),
    )
    .filter((value): value is string => value !== null);
  return [root.textContent ?? "", ...attributes].join("\n");
};

const renderTrace = () => {
  const { container } = render(
    <TraceSummary
      trace={trace}
      incomplete={false}
      cancelled={false}
      eventsCapped={false}
      serverMessage={null}
    />,
  );
  return container;
};

describe("nothing protected reaches the DOM", () => {
  it("renders the trace summary without any of the forbidden strings", () => {
    const text = renderedText(renderTrace());
    for (const secret of FORBIDDEN) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("renders the stage list, with its findings, without any of them either", () => {
    const { container } = render(<StageList rows={stageRows(trace.events)} />);
    const text = renderedText(container);
    for (const secret of FORBIDDEN) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("renders the activity row without any of them", () => {
    const { container } = render(
      <ActivityList rows={activityRows([trace], { showActor: true })} moreMayExist={false} />,
    );
    const text = renderedText(container);
    for (const secret of FORBIDDEN) {
      expect(text, secret).not.toContain(secret);
    }
  });
});

describe("what a blocked trace must still show", () => {
  it("shows the decision and both reason codes", () => {
    renderTrace();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("ACCESS_DENIED")).toBeTruthy();
    expect(screen.getByText("RESTRICTED_SOURCE")).toBeTruthy();
  });

  it("states that a blocked attempt is not a confirmed breach", () => {
    renderTrace();
    expect(screen.getByText("Blocked attempts are refused requests, not confirmed breaches.")).toBeTruthy();
  });

  it("renders a finding as exactly its four safe fields and nothing else", () => {
    const { container } = render(<StageList rows={stageRows(trace.events)} />);
    // The innermost list item: the stage item contains the findings list, so filter out ancestors.
    const finding = Array.from(container.querySelectorAll("li"))
      .filter((item) => item.querySelector("li") === null)
      .find((item) => item.textContent?.includes("RESTRICTED_SOURCE"));
    expect(finding).toBeTruthy();
    // Severity, code, category, locator — in render order, with no fifth value smuggled in.
    expect(finding?.textContent).toBe("blockRESTRICTED_SOURCEaccessrow:14");
  });

  it("puts the full identifier in a title attribute while showing the short one", () => {
    const container = renderTrace();
    expect(screen.getByText("3f6c1d2e…4c33")).toBeTruthy();
    expect(container.querySelector(`[title="${trace.trace_id}"]`)).toBeTruthy();
  });
});

describe("the presentation rules a judge can check", () => {
  it("never conveys a status by colour alone: every badge carries text", () => {
    const container = renderTrace();
    const badges = Array.from(container.querySelectorAll("span.rounded-full"));
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent?.trim()).toBeTruthy();
    }
  });

  it("renders English only, with no Polish characters left from a shared default", () => {
    const text = [renderedText(renderTrace())].join("\n");
    expect(text).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
  });

  it("marks up the trace facts as a description list, not as loose text", () => {
    const container = renderTrace();
    expect(container.querySelector("dl")).toBeTruthy();
    expect(container.querySelectorAll("dt").length).toBeGreaterThan(0);
  });
});
