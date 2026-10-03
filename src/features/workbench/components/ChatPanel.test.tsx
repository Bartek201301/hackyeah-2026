// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_UNAVAILABLE_SEAM, devEnvelope, devRun } from "../lib/fixtures";
import { CANCEL_UNAVAILABLE } from "../lib/runState";

/*
 * What a refused cancel request must not do to a live run.
 *
 * `run_cancel` is still the 503 seam, so today every Cancel click takes this path, and a 503
 * carries no decision by contract: the run keeps running. Piping that response into the run's own
 * outcome would tell a judge mid-demo that the request failed when it did not.
 */

const PENDING = devEnvelope({ data: devRun("pending", "queued") });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/*
 * TEST FAKE gateway: starts a run, never settles the execute call (so the run stays in flight and
 * Cancel stays on screen) and answers the cancel path however the test asks.
 */
const gateway = (cancelWith: () => Response) => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push(url);
    if (url.endsWith("/cancel")) return cancelWith();
    if (url.endsWith("/execute")) return new Promise<Response>(() => {});
    return json(url.endsWith("/chat") ? 202 : 200, PENDING);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Send a question and wait until the run is in flight and cancellable.
 *
 * The panel builds its gateway client at module load and openapi-fetch binds `globalThis.fetch`
 * there and then, so the module is imported only after the stub is in place.
 */
const startRun = async () => {
  vi.resetModules();
  const { ChatPanel } = await import("./ChatPanel");
  render(<ChatPanel />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Brief me on revenue." } });
  fireEvent.click(screen.getByRole("button", { name: /Send question/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Cancel run/ })).toBeTruthy());
};

describe("Cancel run, when the gateway cannot cancel", () => {
  it("says cancellation was refused and leaves the run running", async () => {
    const calls = gateway(() => json(503, DEV_UNAVAILABLE_SEAM));
    await startRun();

    fireEvent.click(screen.getByRole("button", { name: /Cancel run/ }));
    await waitFor(() => expect(screen.getByText(CANCEL_UNAVAILABLE)).toBeTruthy());

    // The run is untouched: still queued, still cancellable, and never reported as a failure.
    expect(screen.getAllByText(/Queued/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cancel run/ })).toBeTruthy();
    expect(screen.queryByText(/Service unavailable/)).toBeNull();
    expect(screen.queryByText(/Cancelled/)).toBeNull();
    expect(calls.some((url) => url.endsWith("/cancel"))).toBe(true);
  });

  it("still lets a real answer settle the run", async () => {
    // A cancellation the gateway did record is an answer about the run and belongs in the outcome.
    gateway(() => json(200, devEnvelope({ data: devRun("cancelled", "cancelled") })));
    await startRun();

    fireEvent.click(screen.getByRole("button", { name: /Cancel run/ }));
    await waitFor(() => expect(screen.getAllByText(/Cancelled/).length).toBeGreaterThan(0));
    expect(screen.queryByText(CANCEL_UNAVAILABLE)).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel run/ })).toBeNull();
  });
});
