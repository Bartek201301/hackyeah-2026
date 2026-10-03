import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { PAGE_LIMIT, listAudit, toListProjection } from "./auditList";
import { notExecutedUsage } from "./envelope";
import type { ActivityRow, GatewayDeps, RepositoryPort } from "./ports";

const actor: ActorContext = {
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  role: "analyst",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const admin: ActorContext = { ...actor, role: "admin" };
const TRACE = "6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f";

let seq = 0;
const row = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  trace_id: `6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e${String(++seq).padStart(2, "0")}`,
  actor_id: actor.actor_id,
  operation: "chat_start",
  state: "completed",
  decision: "ALLOW",
  reasons: [],
  usage: notExecutedUsage("illustrative-v1"),
  policy_version: 1,
  feed_version: 1,
  created_at: "2026-10-03T19:53:09.344599+00:00",
  ...overrides,
});

// TEST FAKE: records what the engine asked for, and answers with fixed rows.
function fakeDeps(rows: ActivityRow[] | null) {
  const calls: Parameters<RepositoryPort["listActivity"]>[0][] = [];
  const repository = {
    async listActivity(input: Parameters<RepositoryPort["listActivity"]>[0]) {
      calls.push(input);
      return rows;
    },
  } as unknown as RepositoryPort;
  return { deps: { repository, detection: null, generation: null } as GatewayDeps, calls };
}

const list = async (who: ActorContext, after: string | null, rows: ActivityRow[] | null = []) => {
  const { deps, calls } = fakeDeps(rows);
  return { outcome: await listAudit(deps, who, after), calls };
};

describe("the scope of the list", () => {
  it("reads the signed-in actor's own activity, in the query", async () => {
    const { calls } = await list(actor, null);
    expect(calls[0]).toMatchObject({
      organisationId: actor.organisation_id,
      actorId: actor.actor_id,
      limit: PAGE_LIMIT,
    });
  });

  /*
   * audit_list has one parameter in the contract, `after`, so the list can only mean one thing.
   * Returning organisation rows to an admin would put other people's operations under a heading
   * that says they are the reader's own.
   */
  it("does not widen for an admin", async () => {
    const { calls } = await list(admin, null);
    expect(calls[0].actorId).toBe(admin.actor_id);
  });
});

describe("the cursor", () => {
  it("refuses anything that is not a uuid before asking the database", async () => {
    const { outcome, calls } = await list(actor, "not-a-uuid");
    expect(outcome.status).toBe(400);
    expect(outcome.body.error?.code).toBe("INVALID_INPUT");
    expect(calls).toEqual([]);
  });

  it("passes a valid cursor through", async () => {
    const { calls } = await list(actor, TRACE);
    expect(calls[0].after).toBe(TRACE);
  });

  it("reads an unreachable cursor as invalid, never as a hint that the trace exists", async () => {
    // The repository returns null when the cursor is not one of this actor's rows.
    const { outcome } = await list(actor, TRACE, null);
    expect(outcome.status).toBe(400);
    expect(outcome.body.error?.code).toBe("INVALID_INPUT");
    expect(outcome.body.error?.message).not.toContain(TRACE);
  });
});

describe("the page", () => {
  it("projects each row field by field, without events", async () => {
    const { outcome } = await list(actor, null, [row()]);
    expect(outcome.status).toBe(200);
    const items = (outcome.body.data as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    // Absent, not empty: an empty array would claim the operation recorded no stages.
    expect(Object.keys(items[0] as object)).not.toContain("events");
  });

  it("carries no column the contract does not publish", () => {
    const projection = toListProjection(row());
    expect(Object.keys(projection).sort()).toEqual([
      "actor_id",
      "created_at",
      "decision",
      "feed_version",
      "operation",
      "policy_version",
      "reasons",
      "state",
      "trace_id",
      "usage",
    ]);
  });

  it("withholds the whole page when one row does not match the contract", async () => {
    // finalize_run may leave the versions null; a projection requires them.
    const { outcome } = await list(actor, null, [row(), row({ policy_version: null })]);
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(outcome.body.data).toBeNull();
  });

  it("returns an empty page as empty, not as an error", async () => {
    const { outcome } = await list(actor, null, []);
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toEqual({ items: [] });
  });

  it("describes the read itself at the root, not the operations it lists", async () => {
    const { outcome } = await list(actor, null, [row({ decision: "BLOCK" })]);
    expect(outcome.body.decision).toBe("ALLOW");
    expect(outcome.body.error).toBeNull();
  });

  it("asks for at most one page, which the contract caps at 100", async () => {
    const { calls } = await list(actor, null);
    expect(calls[0].limit).toBe(100);
  });
});
