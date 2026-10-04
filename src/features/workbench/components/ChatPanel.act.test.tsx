// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "@/shared/contracts";
import { devCitation, devEnvelope, devRun } from "../lib/fixtures";

const RUN_TRACE = "00000000-0000-4000-8000-0000000000aa";
const CLIENT_TRACE = "11111111-1111-4111-8111-111111111111";
const REQUEST = "Raise Northwind's annual fee to 120,000";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* TEST FAKE gateway: /actions creates a pending chat run, execute answers with `final`. */
const gateway = (final: ApiResponse) => {
  const calls: { url: string; method: string; key: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      calls.push({ url: req.url, method: req.method, key: req.headers.get("Idempotency-Key") });
      if (req.url.endsWith("/execute")) return json(200, final);
      return json(202, devEnvelope({ data: devRun("pending", "queued") }));
    }),
  );
  return calls;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The panel binds fetch at module load (openapi-fetch), so import it after the stub. */
const act = async (final: ApiResponse) => {
  const calls = gateway(final);
  vi.resetModules();
  const { ChatPanel } = await import("./ChatPanel");
  render(<ChatPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Act on clients" }));
  const box = screen.getByRole("textbox");
  expect(box.getAttribute("placeholder")).toBe("e.g. Raise Northwind's annual fee to 120,000");
  fireEvent.change(box, { target: { value: REQUEST } });
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  return calls;
};

const decided = (decision: "ALLOW" | "REVIEW" | "BLOCK", reasons: string[], data: unknown) =>
  devEnvelope({ decision, reasons, data: data as ApiResponse["data"] });

describe("ChatPanel Act mode", () => {
  it("sends to /actions, executes the run once and shows ALLOW with both trace links", async () => {
    const calls = await act(
      decided("ALLOW", [], { action: "update", client_id: "c1", client_trace_id: CLIENT_TRACE }),
    );
    await screen.findByText("Done: client updated");
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "POST /api/v1/actions",
      `POST /api/v1/runs/${devRun("pending", "").id}/execute`,
    ]);
    expect(calls[0].key).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`/audit?trace=${RUN_TRACE}`, `/audit?trace=${CLIENT_TRACE}`, "/clients"]);
  });

  it("holds a change over the role limit in plain English, without Open Clients", async () => {
    await act(
      decided("REVIEW", ["action:change_exceeds_role_limit"], {
        action: "update",
        client_id: "c1",
        client_trace_id: CLIENT_TRACE,
      }),
    );
    await screen.findByText("Held for approval");
    expect(screen.getByText(/exceeds your role's limit/)).toBeTruthy();
    expect(screen.getByText("action:change_exceeds_role_limit")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open Clients" })).toBeNull();
    expect(screen.getByRole("link", { name: "View the client action trace" })).toBeTruthy();
  });

  it("blocks with reason codes and the run trace only when there is no client trace", async () => {
    await act(
      decided("BLOCK", ["action:role_not_permitted"], {
        action: "delete",
        client_id: null,
        client_trace_id: null,
      }),
    );
    await screen.findByText("Blocked");
    expect(screen.getByRole("alert").textContent).toContain("action:role_not_permitted");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      `/audit?trace=${RUN_TRACE}`,
    ]);
  });

  it("never shows an answer or Sources in Act mode, nor echoes the request in the notice", async () => {
    await act(decided("ALLOW", [], { answer: "Secret answer text", citations: [devCitation()] }));
    await screen.findByText("Done: nothing needed to change");
    expect(screen.queryByText("Sources")).toBeNull();
    expect(screen.queryByText("Secret answer text")).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain("Northwind");
  });
});
