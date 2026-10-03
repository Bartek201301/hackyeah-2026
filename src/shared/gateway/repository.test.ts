import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseRepository } from "./repository";

// TEST FAKE: only rpc() is used by these paths; the real client is exercised by test:db and the routes.
const fakeRpc = (rpc: () => Promise<unknown>) =>
  createSupabaseRepository({ rpc } as unknown as SupabaseClient);
const finalize = (repository: ReturnType<typeof createSupabaseRepository>) =>
  repository.finalizeRun({
    runId: "r",
    leaseToken: "l",
    operationId: "o",
    outcome: {} as Parameters<typeof repository.finalizeRun>[0]["outcome"],
  });

describe("createSupabaseRepository error mapping", () => {
  it("passes an RPC ErrorCode through and nothing else", async () => {
    const error = { message: "CONFLICT", details: "lease not held", hint: "h", code: "P0001" };
    const caught = await finalize(fakeRpc(async () => ({ data: null, error }))).catch((e) => e);
    expect(caught).toMatchObject({ name: "GatewayError", code: "CONFLICT", message: "CONFLICT" });
  });

  it("maps database and network errors to STATE_UNAVAILABLE without their text", async () => {
    const error = { message: 'invalid input syntax for type uuid: "secret-input"', code: "22P02" };
    for (const rpc of [
      async () => ({ data: null, error }),
      async () => Promise.reject(new TypeError("fetch failed: secret-host")),
    ]) {
      const caught = await finalize(fakeRpc(rpc)).catch((e) => e);
      expect(caught).toMatchObject({ code: "STATE_UNAVAILABLE", message: "STATE_UNAVAILABLE" });
    }
  });

  it("reads finalized strictly", async () => {
    expect(await finalize(fakeRpc(async () => ({ data: { finalized: true }, error: null })))).toBe(true);
    expect(await finalize(fakeRpc(async () => ({ data: { finalized: false }, error: null })))).toBe(false);
  });
});

describe("createSupabaseRepository window queries", () => {
  // TEST FAKE: a query builder that records each call and resolves to no rows.
  function recording() {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ["from", "select", "eq", "neq", "gte", "lte", "order", "limit", "overrideTypes"]) {
      builder[name] = (...args: unknown[]) => (calls.push([name, ...args]), builder);
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
    return { calls, repository: createSupabaseRepository(builder as unknown as SupabaseClient) };
  }
  const window = { organisationId: "org", from: "f", to: "t", limit: 5 };

  it("leaves db_test rows out of metrics and export, and filters own scope in the query", async () => {
    const { calls, repository } = recording();
    await repository.readMetricsRows({ ...window, ownActorId: "me" });
    await repository.exportActivity({ ...window, ownActorId: null });
    expect(calls.filter(([name]) => name === "neq")).toEqual([
      ["neq", "operation", "db_test"],
      ["neq", "operation", "db_test"],
    ]);
    expect(calls).toContainEqual(["eq", "actor_id", "me"]);
    expect(calls.filter(([name, column]) => name === "eq" && column === "actor_id")).toHaveLength(1);
  });

  it("keeps the own-scope filter for any identifier, including a falsy one", async () => {
    // Own scope is decided by the caller passing an id, not by that id being truthy: dropping the
    // filter would widen the read to the whole organisation on data that only looked empty.
    const { calls, repository } = recording();
    await repository.exportActivity({ ...window, ownActorId: "" });
    await repository.readMetricsRows({ ...window, ownActorId: "" });
    expect(calls).toContainEqual(["eq", "actor_id", ""]);
    expect(calls).toContainEqual(["eq", "operations.actor_id", ""]);
  });
});

describe("createSupabaseRepository excerpt access", () => {
  const actor = {
    actor_id: "a",
    organisation_id: "o",
    role: "analyst" as const,
    deal_ids: ["d1"],
    audience: "actor" as const,
    scopes: [],
  };

  it("sends only the actor's identity: role and deals are derived in SQL", async () => {
    const calls: unknown[][] = [];
    // TEST FAKE: records each RPC and answers with no rows.
    const repository = createSupabaseRepository({
      rpc: async (...args: unknown[]) => (calls.push(args), { data: [], error: null }),
    } as unknown as SupabaseClient);
    await repository.searchPermittedExcerpts(actor, {
      query: "q",
      dealId: null,
      audience: "actor",
      limit: 5,
    });
    await repository.readPermittedExcerpts(actor, "public", ["e1"]);
    expect(calls).toEqual([
      [
        "search_permitted_excerpts",
        {
          p_organisation_id: "o",
          p_actor_id: "a",
          p_audience: "actor",
          p_query: "q",
          p_limit: 5,
          p_deal_id: null,
        },
      ],
      [
        "read_permitted_excerpts",
        { p_organisation_id: "o", p_actor_id: "a", p_audience: "public", p_ids: ["e1"] },
      ],
    ]);
  });
});
