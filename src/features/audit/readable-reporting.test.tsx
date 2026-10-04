// @vitest-environment happy-dom
/*
 * Plain-language reporting in the rendered DOM: the activity list shows labels with the stored code
 * only in the tooltip and accessible description, the trace page keeps the raw code visible for an
 * auditor, the "What happened" sentence reaches the reader, and the decision filters work by keyboard.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityList } from "./components/ActivityList";
import { TraceSummary } from "./components/TraceSummary";
import { activityRows } from "./activity";
import { auditEvent, projection } from "./test-support";

afterEach(cleanup);

const blocked = projection({
  trace_id: "11111111-1111-4111-8111-111111111111",
  operation: "chat_start",
  decision: "BLOCK",
  reasons: ["input_signature:SIG-001"],
  state: "blocked",
  events: [auditEvent({ stage: "input_signature", event_type: "decision" })],
});
const held = projection({
  trace_id: "22222222-2222-4222-8222-222222222222",
  operation: "action_start",
  decision: "REVIEW",
  reasons: ["action:change_exceeds_role_limit"],
});
const allowed = projection({ trace_id: "33333333-3333-4333-8333-333333333333", operation: "export_start" });

const renderList = () =>
  render(<ActivityList rows={activityRows([blocked, held, allowed])} moreMayExist={false} />);
const summary = (trace = blocked) =>
  render(
    <TraceSummary
      trace={trace}
      incomplete={false}
      cancelled={false}
      eventsCapped={false}
      serverMessage={null}
    />,
  );

describe("activity list reasons", () => {
  it("shows the label, keeps the raw code out of visible text and in the title and description", () => {
    const { container } = renderList();
    const label = screen.getByText("Known prompt-injection pattern (SIG-001)");
    const item = label.closest("[title]");
    expect(item?.getAttribute("title")).toBe("input_signature:SIG-001");
    expect(item?.getAttribute("aria-description")).toBe("input_signature:SIG-001");
    expect(container.textContent).not.toContain("input_signature:SIG-001");
    expect(screen.getByText("Question")).toBeTruthy();
    expect(screen.getByText("Client action from chat")).toBeTruthy();
    expect(screen.getByText("Public PDF summary")).toBeTruthy();
  });
});

describe("decision filters", () => {
  it("narrows the loaded rows, marks the pressed chip and says what it filters", () => {
    renderList();
    const group = screen.getByRole("group", { name: "Filter by decision" });
    const chip = (name: RegExp) => within(group).getByRole("button", { name });
    expect(chip(/^All \(3\)$/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Filters the loaded records")).toBeTruthy();

    fireEvent.click(chip(/^Blocked/));
    expect(chip(/^Blocked/).getAttribute("aria-pressed")).toBe("true");
    expect(chip(/^All \(/).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Question")).toBeTruthy();
    expect(screen.queryByText("Client action from chat")).toBeNull();

    fireEvent.click(chip(/^Held/));
    expect(screen.getByText("Client action from chat")).toBeTruthy();
    expect(screen.queryByText("Question")).toBeNull();
  });

  it("shows an empty state for a filter with no loaded rows", () => {
    render(<ActivityList rows={activityRows([allowed])} moreMayExist={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Blocked \(0\)$/ }));
    expect(screen.getByText("No blocked records among the loaded ones.")).toBeTruthy();
  });
});

describe("trace page", () => {
  it("shows the plain label and keeps the raw code visible under it", () => {
    summary();
    expect(screen.getByText("Known prompt-injection pattern (SIG-001)", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("input_signature:SIG-001", { selector: "code" })).toBeTruthy();
  });

  it("opens with a What happened sentence for each decision", () => {
    summary();
    expect(screen.getByText("What happened")).toBeTruthy();
    expect(
      screen.getByText(
        "Question refused at the known-pattern check on the question: Known prompt-injection pattern (SIG-001). Nothing was released or written.",
      ),
    ).toBeTruthy();
    cleanup();
    summary(held);
    expect(screen.getByText(/^Client action from chat held for a person to decide/)).toBeTruthy();
    cleanup();
    summary(allowed);
    expect(screen.getByText(/^Public PDF summary: passed every check and was released\./)).toBeTruthy();
  });
});
