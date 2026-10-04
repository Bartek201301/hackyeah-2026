import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { readAudit } from "./audit";
import { SEMANTIC_NOT_REQUIRED, notExecutedUsage } from "./envelope";
import type { ActivityRow, EventRow, GatewayDeps, RepositoryPort } from "./ports";

// Rows shaped exactly as begin_operation, reserve_call, finish_call and finalize_run write them.
const TRACE = "6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f";
const SHA = "a".repeat(64);
const LAYA_1 = "11111111-1111-4111-8111-111111111111";
const OLLAMA = "22222222-2222-4222-8222-222222222222";
const LAYA_2 = "33333333-3333-4333-8333-333333333333";
const at = (s: number) => `2026-10-03T19:00:${String(s).padStart(2, "0")}.123456+00:00`;
const actor: ActorContext = {
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  role: "employee",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const usage = {
  ...notExecutedUsage("demo-2026-10"),
  generation_input_tokens: 120,
  generation_output_tokens: 80,
  generation_ms: 900,
  semantic_input_tokens: 140,
  semantic_ms: 112,
  reserved_generation_tokens: 2400,
  comparison_micro_usd: 46,
};
const activity = (decision: "ALLOW" | "BLOCK", state: string): ActivityRow => ({
  trace_id: TRACE,
  actor_id: actor.actor_id,
  operation: "chat_start",
  state,
  decision,
  reasons: decision === "BLOCK" ? ["input_signature:SIG-001"] : [],
  usage: decision === "BLOCK" ? notExecutedUsage("demo-2026-10") : usage,
  policy_version: 1,
  feed_version: 1,
  created_at: at(9),
});
const intent = (operation: string, s: number): EventRow => ({
  event_type: "intent",
  payload: { operation, request_sha256: SHA, policy_version: 1, feed_version: 1 },
  created_at: at(s),
});
const limits = { actor_limit: 200000, org_limit: 2000000 };
const started = (call_id: string, provider: string, units: object[], s: number): EventRow => ({
  event_type: "provider_started",
  payload: { call_id, provider, units: units.map((u) => ({ ...u, ...limits })) },
  created_at: at(s),
});
const settled = (call_id: string, usage: object[], s: number): EventRow => ({
  event_type: "completion",
  payload: { call_id, settled: usage.length * 2, unresolved: 0, overrun: false, usage },
  created_at: at(s),
});
const decision = (stage: string, d: string, findings: object[], u: object, s: number): EventRow => ({
  event_type: "decision",
  payload: { stage, decision: d, reasons: [], findings, semantic: SEMANTIC_NOT_REQUIRED, usage: u },
  created_at: at(s),
});
const layaUnits = [{ unit: "semantic_tokens", amount: 65536 }];
const ollamaUnits = [
  { unit: "generation_ms", amount: 30000 },
  { unit: "generation_tokens", amount: 2400 },
];

const blockEvents = [
  intent("chat_start", 1),
  intent("run_execute", 2),
  decision(
    "input_signature",
    "BLOCK",
    [
      {
        code: "SIG-001",
        category: "prompt_injection",
        severity: "block",
        stage: "input_signature",
        locator: null,
      },
    ],
    notExecutedUsage("demo-2026-10"),
    3,
  ),
];
const allowEvents = [
  intent("chat_start", 1),
  intent("run_execute", 2),
  started(LAYA_1, "laya", layaUnits, 3),
  settled(LAYA_1, [{ unit: "semantic_tokens", reserved: 65536, actual: 60, state: "settled" }], 4),
  started(OLLAMA, "ollama", ollamaUnits, 5),
  settled(
    OLLAMA,
    [
      { unit: "generation_ms", reserved: 30000, actual: 900, state: "settled" },
      { unit: "generation_tokens", reserved: 2400, actual: 200, state: "settled" },
    ],
    6,
  ),
  started(LAYA_2, "laya", layaUnits, 7),
  settled(LAYA_2, [{ unit: "semantic_tokens", reserved: 65536, actual: 80, state: "settled" }], 8),
  decision("done", "ALLOW", [], usage, 9),
];

// TEST FAKE: unit tests only; the app never composes these.
const deps = (trace: { activity: ActivityRow; events: EventRow[] } | null): GatewayDeps => ({
  repository: { readTrace: async () => trace } as unknown as RepositoryPort,
  detection: null,
  generation: null,
});
const read = (activityRow: ActivityRow, events: EventRow[]) =>
  readAudit(deps({ activity: activityRow, events }), actor, TRACE);
const items = (body: { data: unknown }) => (body.data as { items: { events: { stage: string }[] }[] }).items;

describe("readAudit", () => {
  it("projects a BLOCK trace into a valid envelope for the read itself", async () => {
    const { status, body } = await read(activity("BLOCK", "blocked"), blockEvents);
    expect(status).toBe(200);
    expect(check("Response", body).ok).toBe(true);
    expect(body).toMatchObject({ decision: "ALLOW", error: null, semantic: { status: "not_required" } });
    expect(items(body)[0]).toMatchObject({ trace_id: TRACE, decision: "BLOCK", state: "blocked" });
    expect(items(body)[0].events.map((e) => e.stage)).toEqual([
      "chat_start",
      "run_execute",
      "input_signature",
    ]);
  });

  it("projects an ALLOW trace with per-call stages and usage", async () => {
    const { status, body } = await read(activity("ALLOW", "completed"), allowEvents);
    expect(status).toBe(200);
    expect(check("Response", body).ok).toBe(true);
    const events = items(body)[0].events;
    expect(events.map((e) => e.stage)).toEqual([
      "chat_start",
      "run_execute",
      "laya:reserved",
      "laya:settled",
      "ollama:reserved",
      "ollama:settled",
      "laya:reserved",
      "laya:settled",
      "done",
    ]);
    expect(events[4]).toMatchObject({ usage: { reserved_generation_tokens: 2400, generation_ms: 0 } });
    expect(events[5]).toMatchObject({
      usage: {
        generation_input_tokens: null,
        generation_output_tokens: null,
        generation_ms: 900,
        semantic_input_tokens: 0,
        reserved_generation_tokens: 2400,
        comparison_micro_usd: null,
      },
    });
    expect(events[7]).toMatchObject({ usage: { semantic_input_tokens: 80, generation_input_tokens: 0 } });
  });

  it("takes the completion provider from the matching call id, not the last start", async () => {
    const [i1, i2, layaStart, layaDone, ollamaStart, ...rest] = allowEvents;
    const { body } = await read(activity("ALLOW", "completed"), [
      i1,
      i2,
      layaStart,
      ollamaStart,
      layaDone,
      ...rest,
    ]);
    expect(items(body)[0].events[4].stage).toBe("laya:settled");
  });

  it("copies no unmapped payload keys", async () => {
    const { body } = await read(activity("ALLOW", "completed"), allowEvents);
    const json = JSON.stringify(body);
    for (const leak of [SHA, LAYA_1, OLLAMA, "request_sha256", "call_id", "actor_limit", "overrun"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("projects a reconcile charge by its action only, never the admin's reason", async () => {
    const REASON = "G2 S11 outage drill: Laya stopped; usage unknown";
    const charged: EventRow = {
      event_type: "configuration",
      payload: {
        action: "reconcile_charge",
        call_id: LAYA_1,
        units: [{ unit: "semantic_tokens", amount: 65536 }],
        reason_code: "reconcile:charged_conservatively",
        reason: REASON,
      },
      created_at: at(9),
    };
    const unresolved = [{ unit: "semantic_tokens", reserved: 65536, actual: null, state: "unresolved" }];
    const { status, body } = await read(activity("BLOCK", "incomplete"), [
      ...allowEvents.slice(0, 3),
      settled(LAYA_1, unresolved, 4),
      charged,
    ]);
    expect(status).toBe(200);
    expect(check("Response", body).ok).toBe(true);
    expect(
      items(body)[0]
        .events.map((e) => e.stage)
        .slice(-2),
    ).toEqual(["laya:settled", "reconcile_charge"]);
    const json = JSON.stringify(body);
    for (const leak of [REASON, "reason_code", LAYA_1]) expect(json).not.toContain(leak);
  });

  it("refuses a trace above the event cap instead of truncating it", async () => {
    const many = Array.from({ length: 201 }, (_, i) => intent("run_execute", i % 60));
    const { status, body } = await read(activity("ALLOW", "completed"), many);
    expect(status).toBe(413);
    expect(body).toMatchObject({ data: null, error: { code: "INCOMPLETE" } });
    expect(check("Response", body).ok).toBe(true);
  });

  it.each([
    [
      "an extra usage key",
      [...blockEvents.slice(0, 2), decision("done", "ALLOW", [], { ...usage, answer: "x" }, 3)],
    ],
    ["a completion without its start", [intent("chat_start", 1), allowEvents[3]]],
    ["an unmapped event type", [{ event_type: "review", payload: {}, created_at: at(1) }]],
    ["a missing intent operation", [{ ...blockEvents[0], payload: { request_sha256: SHA } }]],
  ])("withholds the whole trace on %s", async (_, events) => {
    const { status, body } = await read(activity("BLOCK", "blocked"), events);
    expect(status).toBe(503);
    expect(body).toMatchObject({ data: null, error: { code: "STATE_UNAVAILABLE" } });
  });

  it("withholds a projection with null versions", async () => {
    const { status } = await read({ ...activity("BLOCK", "blocked"), policy_version: null }, blockEvents);
    expect(status).toBe(503);
  });

  it("answers 404 when the repository finds no authorised trace", async () => {
    const { status, body } = await readAudit(deps(null), actor, TRACE);
    expect(status).toBe(404);
    expect(body).toMatchObject({ decision: null, error: { code: "NOT_FOUND" } });
  });
});
