// @vitest-environment happy-dom
/*
 * The assertions that were waiting for a DOM runner and nothing else.
 *
 * Each of these is a claim about what the rendered page does or refuses to do, so none of them
 * could be made against a view model: a control that must not exist, a figure that must not be
 * computed, a sentence that must actually reach the reader, and a double click that must issue one
 * request. PR #43 made them possible; they were "not run" until now.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityList } from "./components/ActivityList";
import { DashboardStateBlock } from "./components/DashboardStates";
import { ExportButton } from "./components/ExportButton";
import { TraceStateBlock } from "./components/TraceStates";
import { TraceSummary } from "./components/TraceSummary";
import { activityRows } from "./activity";
import { projection, usage } from "./test-support";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summary = (overrides: Parameters<typeof projection>[0] = {}, flags = {}) =>
  render(
    <TraceSummary
      trace={projection(overrides)}
      incomplete={false}
      cancelled={false}
      eventsCapped={false}
      serverMessage={null}
      {...flags}
    />,
  );

describe("AT10-13 — a refusal that must not invite a retry", () => {
  it("renders the rate-limit message with no control to press", () => {
    const { container } = render(<DashboardStateBlock state={{ kind: "rateLimited" }} onRetry={() => {}} />);
    expect(screen.getByText("Too many requests. Try again shortly.")).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
  });

  it("does the same on the trace screen", () => {
    const { container } = render(<TraceStateBlock state={{ kind: "rateLimited" }} onRetry={() => {}} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("still offers a retry where retrying is reasonable", () => {
    const { container } = render(
      <DashboardStateBlock state={{ kind: "auditUnavailable" }} onRetry={() => {}} />,
    );
    expect(container.querySelector("button")).toBeTruthy();
  });
});

describe("AT15-4 — generation and Laya are never added together", () => {
  it("shows both figures and never their sum", () => {
    const { container } = summary({
      usage: usage({ generation_input_tokens: 1842, semantic_input_tokens: 2048 }),
    });
    const text = container.textContent ?? "";
    expect(text).toContain("1,842 tokens");
    expect(text).toContain("2,048 tokens");
    // 1842 + 2048. No element anywhere may present the two as one number.
    expect(text).not.toContain("3,890");
  });
});

describe("AT15-10 — the overhead breakdown is declared missing, not estimated", () => {
  it("renders the sentence on the trace screen", () => {
    summary();
    expect(screen.getByText("Gateway overhead breakdown is not exposed by this endpoint.")).toBeTruthy();
  });
});

describe("AT15-12 — cancellation does not prove zero consumption", () => {
  it("renders the sentence when the trace was cancelled", () => {
    summary({ reasons: ["CANCELLED"], state: "cancelled" }, { cancelled: true });
    expect(screen.getByText(/Cancellation does not prove the provider stopped work\./)).toBeTruthy();
  });

  it("does not render it otherwise", () => {
    const { container } = summary();
    expect(container.textContent).not.toContain("Cancellation does not prove");
  });
});

describe("AT10-8 — a full page says so and offers the next one", () => {
  it("states the cap and asks for older records once per press", () => {
    const onLoadOlder = vi.fn();
    render(<ActivityList rows={activityRows([projection()])} moreMayExist onLoadOlder={onLoadOlder} />);
    expect(screen.getByText("Showing the 100 most recent records.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load older records" }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("offers no control when the page was not full", () => {
    const { container } = render(
      <ActivityList rows={activityRows([projection()])} moreMayExist={false} onLoadOlder={() => {}} />,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).not.toContain("Showing the 100 most recent records.");
  });

  it("keeps the rows on screen when an older page fails", () => {
    render(
      <ActivityList rows={activityRows([projection()])} moreMayExist onLoadOlder={() => {}} olderFailed />,
    );
    expect(screen.getByText("Older records could not be loaded.")).toBeTruthy();
    // The row that was already displayed is still displayed; a network error is not data loss.
    expect(screen.getByText("chat_answer")).toBeTruthy();
  });
});

describe("AT16-6 — double-clicking the export issues one request", () => {
  it("sends a single request for two immediate clicks", () => {
    const refusal = {
      status: 503,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        trace_id: "0540d652-0221-4b3b-8307-d759cd9a0a7f",
        error: { code: "STATE_UNAVAILABLE", message: "Not available yet.", retryable: true },
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(refusal);
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportButton scope="own" day="2026-10-03" />);
    const button = screen.getByRole("button", { name: /Download audit CSV/ });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/audit/export?scope=own");
    // The day on screen is the day exported; the request is not left to a server default.
    expect(String(fetchMock.mock.calls[0][0])).toContain("2026-10-03T00%3A00%3A00.000Z");
  });
});
