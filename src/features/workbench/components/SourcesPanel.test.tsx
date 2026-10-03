// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { devEnvelope, devError, devRun } from "../lib/fixtures";

/*
 * The upload lifecycle on one screen: create -> execute once -> report the decision.
 *
 * `POST /imports/upload` only quarantines the file and answers 202; without the execute call the
 * panel would sit on "Request accepted" forever and the demo would look like a hang. These tests
 * pin the three things that are easy to get wrong and invisible until a judge is watching: execute
 * is called exactly once with the upload's own Idempotency-Key, a REDACT is reported as a partial
 * publication rather than a success, and the lists are re-read once the run settles.
 */

const RUN = devRun("pending", "quarantine", "import");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Reply = { status: number; body: unknown };

/*
 * TEST FAKE gateway: records every call and answers the upload, execute and list paths. The app
 * never composes this; it exists so the panel can be driven without a server.
 */
const gateway = (execute: Reply) => {
  const calls: { method: string; url: string; key: string | null }[] = [];
  const lists = { sources: 0, imports: 0 };
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const request = input as Request;
    const url = typeof input === "string" ? input : request.url;
    const method = (typeof input === "string" ? init?.method : request.method) ?? "GET";
    const headers = typeof input === "string" ? new Headers(init?.headers) : request.headers;
    calls.push({ method, url, key: headers.get("idempotency-key") });

    if (url.endsWith("/sources")) {
      lists.sources += 1;
      return json(200, devEnvelope({ decision: "ALLOW", data: { items: [] } }));
    }
    if (url.endsWith("/imports")) {
      lists.imports += 1;
      return json(200, devEnvelope({ decision: "ALLOW", data: { items: [] } }));
    }
    if (url.endsWith("/imports/upload")) return json(202, devEnvelope({ data: RUN }));
    if (url.endsWith("/execute")) return json(execute.status, execute.body);
    return json(404, devError("NOT_FOUND", "no"));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, lists };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Choose a CSV, classify it and upload. The panel is imported after the fetch stub is in place,
 *  because openapi-fetch binds `globalThis.fetch` when the module builds its client. */
const upload = async (fileName = "MIX-01.csv") => {
  vi.resetModules();
  const { SourcesPanel } = await import("./SourcesPanel");
  render(<SourcesPanel />);
  const file = new File(["text,source_date,period,unit,fact_key,basis\n"], fileName, { type: "text/csv" });
  const input = document.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  fireEvent.change(screen.getByRole("combobox", { name: /Classification/ }), {
    target: { value: "internal" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Upload file/ }));
};

describe("SourcesPanel upload lifecycle", () => {
  it("executes the created run exactly once, with the upload's own key", async () => {
    const { calls } = gateway({
      status: 200,
      body: devEnvelope({ decision: "ALLOW", data: devRun("completed", "publish", "import") }),
    });
    await upload();
    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());

    const started = calls.filter((c) => c.url.endsWith("/imports/upload"));
    const executed = calls.filter((c) => c.url.endsWith("/execute"));
    expect(started).toHaveLength(1);
    expect(executed).toHaveLength(1);
    // Same key as the upload: a replay returns the stored outcome instead of importing twice.
    expect(executed[0]!.key).toBe(started[0]!.key);
    expect(executed[0]!.url).toContain(RUN.id);
  });

  it("reports a REDACT as a partial publication, not as a success", async () => {
    gateway({
      status: 200,
      body: devEnvelope({
        decision: "REDACT",
        reasons: ["secret:SEC-001", "injection:SIG-001"],
        data: devRun("completed", "publish", "import"),
      }),
    });
    await upload();

    await waitFor(() => expect(screen.getByText("Partially published")).toBeTruthy());
    expect(screen.getByText(/Some units were removed/)).toBeTruthy();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("re-reads the lists once the run settles, so the import becomes a row", async () => {
    const { lists } = gateway({
      status: 200,
      body: devEnvelope({ decision: "BLOCK", data: devRun("completed", "publish", "import") }),
    });
    const onLoad = lists.imports;
    await upload();
    await waitFor(() => expect(screen.getByText("Blocked")).toBeTruthy());
    await waitFor(() => expect(lists.imports).toBeGreaterThan(onLoad));
  });

  it("refuses a PDF in the browser, without a round trip", async () => {
    const { calls } = gateway({ status: 200, body: devEnvelope({ decision: "ALLOW", data: RUN }) });
    await upload("report.pdf");

    await waitFor(() =>
      expect(screen.getByText(/PDF import is not available in this demo build/)).toBeTruthy(),
    );
    expect(calls.some((c) => c.url.endsWith("/imports/upload"))).toBe(false);
  });

  it("shows the server's message when the gateway refuses the import", async () => {
    gateway({
      status: 400,
      body: devError("INVALID_INPUT", "Analyst uploads are restricted to the assigned deal."),
    });
    await upload();
    await waitFor(() =>
      expect(screen.getByText("Analyst uploads are restricted to the assigned deal.")).toBeTruthy(),
    );
  });
});
