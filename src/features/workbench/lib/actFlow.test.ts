import { describe, expect, it } from "vitest";
import { describeAct, readActResult } from "./actFlow";
import type { GatewayOutcome } from "./envelope";

const outcome = (decision: GatewayOutcome["decision"], reasons: string[] = []) =>
  ({ decision, reasons }) as unknown as GatewayOutcome;

describe("readActResult", () => {
  it("accepts only the act payload", () => {
    expect(readActResult({ action: "create", client_id: "c1", client_trace_id: null } as never)).toEqual({
      action: "create",
      clientId: "c1",
      clientTraceId: null,
    });
    expect(readActResult({ answer: "x", citations: [] } as never)).toBeNull();
    expect(readActResult({ action: "drop", client_id: null, client_trace_id: null } as never)).toBeNull();
    expect(readActResult(null)).toBeNull();
  });
});

describe("describeAct", () => {
  it("maps each decision and REVIEW reason to plain English", () => {
    const created = { action: "create", clientId: "c1", clientTraceId: null } as const;
    expect(describeAct(outcome("ALLOW"), created)?.title).toBe("Done: client created");
    const held = (r: string) => describeAct(outcome("REVIEW", [r]), null)?.detail;
    expect(held("action:change_exceeds_role_limit")).toMatch(/role's limit/);
    expect(held("action:destructive_requires_approval")).toMatch(/second person/);
    expect(held("action:client_not_found")).toMatch(/could not identify the client/);
    expect(held("action:unclear_request")).toMatch(/could not understand the request/);
    expect(held("something_else")).toMatch(/second person must approve/);
    expect(describeAct(outcome("BLOCK", ["x"]), null)?.title).toBe("Blocked");
    expect(describeAct(outcome(null), null)).toBeNull();
  });
});
