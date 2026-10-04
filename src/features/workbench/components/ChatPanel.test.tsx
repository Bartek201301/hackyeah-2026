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
const QUESTION = "Brief me on revenue.";

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
  fireEvent.change(screen.getByRole("textbox"), { target: { value: QUESTION } });
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

/*
 * TEST FAKE gateway for the retry path: records what each request carried, creates the run and
 * then fails the execute call with a retryable error, which is what puts "Try again" on screen.
 */
const failingGateway = () => {
  const sent: { url: string; key: string | null; body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const request = input as Request;
      const url = typeof input === "string" ? input : request.url;
      const headers = typeof input === "string" ? new Headers(init?.headers) : request.headers;
      const body = typeof input === "string" ? String(init?.body ?? "") : await request.clone().text();
      sent.push({ url, key: headers.get("idempotency-key"), body });
      if (url.endsWith("/execute")) return json(503, DEV_UNAVAILABLE_SEAM);
      return json(url.endsWith("/chat") ? 202 : 200, PENDING);
    }),
  );
  return sent;
};

/** Ask the question and wait for the retryable failure, which is what offers "Try again". */
const askAndFail = async () => {
  vi.resetModules();
  const { ChatPanel } = await import("./ChatPanel");
  render(<ChatPanel />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: QUESTION } });
  fireEvent.click(screen.getByRole("button", { name: /Send question/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy());
};

describe("the Ask composer", () => {
  it("clears itself and keeps the question on screen as the turn it asked", async () => {
    failingGateway();
    await askAndFail();

    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
  });

  it("reports the stage once while the run is in flight", async () => {
    gateway(() => json(503, DEV_UNAVAILABLE_SEAM));
    await startRun();

    // The outcome notice already classifies progress and says what the stage means. A second badge
    // beside it printed the same words twice in a row, which reads as two separate events.
    expect(screen.getAllByText(/Queued/)).toHaveLength(1);
  });

  it("retries the question that was asked, not the empty composer", async () => {
    const sent = failingGateway();
    await askAndFail();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(sent.filter((r) => r.url.endsWith("/chat"))).toHaveLength(2));

    const [first, second] = sent.filter((r) => r.url.endsWith("/chat"));
    // The composer is empty by now, so a retry that read it would send an empty question.
    expect(JSON.parse(second!.body)).toEqual({ message: QUESTION });
    // Same question, so the same key: a replay returns the stored outcome instead of a second run.
    expect(second!.key).toBe(first!.key);
  });
});
