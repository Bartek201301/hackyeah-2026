// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientsPanel } from "./ClientsPanel";

const TRACE = "0b6a3c1e-1d2f-4a5b-8c9d-0e1f2a3b4c5d";
const ROW = {
  id: "c1",
  name: "Quillfern Robotics",
  sector: null,
  status: "active",
  created_at: "2026-10-04T00:00:00Z",
};
const envelope = (over: object) => ({
  trace_id: TRACE,
  decision: null,
  reasons: [],
  data: null,
  error: null,
  ...over,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* TEST FAKE gateway: the list answers with `rows`; every action answers with `action`. */
const gateway = (rows: object[], action: () => Response = () => json(500, {})) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === "POST" ? action() : json(200, envelope({ data: { items: rows } }));
    }),
  );
  return calls;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientsPanel", () => {
  it("hides the fee when the API did not return one", async () => {
    gateway([ROW]);
    render(<ClientsPanel />);
    await screen.findByText("Quillfern Robotics");
    expect(screen.getByText("Fees are visible to analysts and administrators.")).toBeTruthy();
    expect(screen.queryByText(/\/ year$/)).toBeNull();
  });

  it("shows the fee when the API returned it", async () => {
    gateway([{ ...ROW, annual_fee_usd: 120_000, version: 2 }]);
    render(<ClientsPanel />);
    expect(await screen.findByText(/USD\s120,000 \/ year/)).toBeTruthy();
    expect(screen.queryByText("Fees are visible to analysts and administrators.")).toBeNull();
  });

  it("shows Delete to every role and renders the BLOCK with its trace", async () => {
    const calls = gateway([ROW], () =>
      json(403, envelope({ decision: "BLOCK", reasons: ["action:role_not_permitted"] })),
    );
    render(<ClientsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await screen.findByText("Blocked");
    expect(screen.getByText("action:role_not_permitted")).toBeTruthy();
    expect(screen.getByRole("link", { name: /audited trace/ }).getAttribute("href")).toBe(
      `/audit?trace=${TRACE}`,
    );
    const del = calls.find((c) => c.url.endsWith("/clients/c1/delete"));
    expect(new Headers(del?.init?.headers).get("Idempotency-Key")).toBeTruthy();
  });

  it("sends expected_version with a fee change, a fresh key per action, and shows a held change", async () => {
    const calls = gateway([{ ...ROW, annual_fee_usd: 100_000, version: 4 }], () =>
      json(200, envelope({ decision: "REVIEW", reasons: ["action:change_exceeds_role_limit"] })),
    );
    render(<ClientsPanel />);
    const input = await screen.findByLabelText(/Change fee/);
    for (let i = 0; i < 2; i++) {
      fireEvent.change(input, { target: { value: "130000" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText("Held for approval");
    }
    const updates = calls.filter((c) => c.url.endsWith("/clients/c1/update"));
    expect(JSON.parse(String(updates[0].init?.body))).toEqual({
      expected_version: 4,
      changes: { annual_fee_usd: 130_000 },
    });
    const keys = updates.map((c) => new Headers(c.init?.headers).get("Idempotency-Key"));
    expect(new Set(keys).size).toBe(2);
    expect(screen.getByText(/exceeds your role's limit/)).toBeTruthy();
  });
});
