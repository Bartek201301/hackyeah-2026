// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "@/shared/contracts";
import { devCitation, devEnvelope, devRun } from "../lib/fixtures";

const RUN_TRACE = "00000000-0000-4000-8000-0000000000aa";
const CLIENT_TRACE = "11111111-1111-4111-8111-111111111111";
const ACTION = "Raise Northwind Advisory's annual fee to 150,000";
const QUESTION = "Why do AsterCloud FY2025 revenue records differ?";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { path: string; key: string | null };

/*
 * TEST FAKE gateway: /actions and /chat each create a pending chat run; execute answers with the
 * final envelope of whichever flow started the run.
 */
const gateway = (finals: { act?: ApiResponse; ask?: ApiResponse }) => {
  const calls: Call[] = [];
  let last: "act" | "ask" = "ask";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      const path = new URL(req.url).pathname;
      calls.push({ path, key: req.headers.get("Idempotency-Key") });
      if (path.endsWith("/execute")) return json(200, finals[last]);
      last = path.endsWith("/actions") ? "act" : "ask";
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
const send = async (text: string, finals: { act?: ApiResponse; ask?: ApiResponse }) => {
  const calls = gateway(finals);
  vi.resetModules();
  const { ChatPanel } = await import("./ChatPanel");
  render(<ChatPanel />);
  const box = screen.getByRole("textbox");
  expect(box.getAttribute("placeholder")).toBe(
    "Ask a question, or tell the assistant to add or change a client",
  );
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Send question/ }));
  return calls;
};

const decided = (decision: "ALLOW" | "REVIEW" | "BLOCK", reasons: string[], data: unknown) =>
  devEnvelope({ decision, reasons, data: data as ApiResponse["data"] });
const ANSWER = decided("ALLOW", [], { answer: "Checked answer text", citations: [devCitation()] });
const EXECUTE = `/api/v1/runs/${devRun("pending", "").id}/execute`;

describe("ChatPanel routing", () => {
  it("has one input and no mode toggle", async () => {
    await send(QUESTION, { ask: ANSWER });
    expect(screen.queryByRole("button", { name: "Act on clients" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Mode" })).toBeNull();
  });

  it("sends a question through chat and shows the answer with Sources", async () => {
    const calls = await send(QUESTION, { ask: ANSWER });
    await screen.findByText("Checked answer text");
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/chat", EXECUTE]);
    expect(screen.getByText("Sources")).toBeTruthy();
  });

  it("sends a client change through /actions and shows ALLOW with both trace links", async () => {
    const calls = await send(ACTION, {
      act: decided("ALLOW", [], { action: "update", client_id: "c1", client_trace_id: CLIENT_TRACE }),
    });
    await screen.findByText("Done: client updated");
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/actions", EXECUTE]);
    expect(calls[0].key).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`/audit?trace=${RUN_TRACE}`, `/audit?trace=${CLIENT_TRACE}`, "/clients"]);
    expect(screen.queryByText("Sources")).toBeNull();
  });

  it("holds a change over the role limit in plain English, without Open Clients", async () => {
    await send(ACTION, {
      act: decided("REVIEW", ["action:change_exceeds_role_limit"], {
        action: "update",
        client_id: "c1",
        client_trace_id: CLIENT_TRACE,
      }),
    });
    await screen.findByText("Held for approval");
    expect(screen.getByText(/exceeds your role's limit/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open Clients" })).toBeNull();
  });

  it("blocks with reason codes and only the run trace when there is no client trace", async () => {
    await send("Delete Northwind Advisory", {
      act: decided("BLOCK", ["action:role_not_permitted"], {
        action: "delete",
        client_id: null,
        client_trace_id: null,
      }),
    });
    await screen.findByText("Blocked");
    expect(screen.getByRole("alert").textContent).toContain("action:role_not_permitted");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      `/audit?trace=${RUN_TRACE}`,
    ]);
  });

  it("never renders an answer or Sources from an action run, nor echoes the request", async () => {
    await send(ACTION, {
      act: decided("REVIEW", [], { answer: "Secret answer text", citations: [devCitation()] }),
    });
    await screen.findByText("Held for approval");
    expect(screen.queryByText("Sources")).toBeNull();
    expect(screen.queryByText("Secret answer text")).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain("Northwind");
  });

  it("answers as a question when the action run needed no change, with a fresh key", async () => {
    const calls = await send(ACTION, {
      act: decided("ALLOW", [], { action: "none", client_id: null, client_trace_id: null }),
      ask: ANSWER,
    });
    await screen.findByText("Checked answer text");
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/actions", EXECUTE, "/api/v1/chat", EXECUTE]);
    expect(calls[2].key).not.toBe(calls[0].key);
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.queryByText(/^Done:/)).toBeNull();
  });
});
