import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { sha256Hex } from "./checks";
import { GatewayError, STATUS } from "./envelope";
import type { GatewayDeps, Outcome, RepositoryPort, RunRecord, StoredResult } from "./ports";
import { cancelRun, readRunResult } from "./runs";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "44444444-4444-4444-8444-444444444444";
const actor: ActorContext = {
  actor_id: "55555555-5555-4555-8555-555555555555",
  organisation_id: "66666666-6666-4666-8666-666666666666",
  role: "employee",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};

// TEST FAKE: unit tests only. cancelRun follows cancel_run: own run only, pending → cancelled with the
// result stored, running → cancel_requested, anything else unchanged.
function harness(state: RunRecord["state"], owner = actor.actor_id, lease: string | null = null) {
  const run: RunRecord = {
    id: RUN_ID,
    kind: "chat",
    state,
    stage: "queued",
    policy_version: 3,
    feed_version: 2,
    input_private: {},
    result_private: null,
    lease_expires_at: lease,
  };
  const requests: Parameters<RepositoryPort["cancelRun"]>[0][] = [];
  const repository = {
    async readRun(who: ActorContext, id: string) {
      return id === run.id && who.actor_id === owner ? run : null;
    },
    async cancelRun(input: Parameters<RepositoryPort["cancelRun"]>[0]) {
      requests.push(input);
      if (input.runId !== run.id || input.actor.actor_id !== owner) throw new GatewayError("NOT_FOUND");
      const accepted = run.state === "pending" || run.state === "running";
      if (run.state === "pending")
        Object.assign(run, { state: "cancelled", stage: "cancelled", result_private: input.result });
      else if (run.state === "running") run.state = "cancel_requested";
      return {
        kind: run.kind,
        state: run.state,
        stage: run.stage,
        policy_version: 3,
        feed_version: 2,
        accepted,
      };
    },
  } as unknown as RepositoryPort;
  const deps: GatewayDeps = { repository, detection: null, generation: null };
  return { deps, run, requests, cancel: () => cancelRun(deps, actor, RUN_ID, KEY) };
}

const valid = ({ body }: Outcome) => expect(check("Response", body)).toEqual({ ok: true, value: body });

describe("cancelRun", () => {
  it("cancels a pending run: 200 cancelled, and the run then reads as the stored 409 CANCELLED", async () => {
    const h = harness("pending");
    const out = await h.cancel();
    valid(out);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      trace_id: RUN_ID,
      policy_version: 3,
      feed_version: 2,
      data: { id: RUN_ID, kind: "chat", state: "cancelled", stage: "cancelled" },
      error: null,
    });
    expect(h.requests[0]).toMatchObject({
      runId: RUN_ID,
      idempotencyKey: KEY,
      requestSha256: sha256Hex(RUN_ID),
    });
    const stored = h.requests[0].result as StoredResult;
    expect(stored).toMatchObject({ status: 409, data: null, error: { code: "CANCELLED" } });

    const read = await readRunResult(h.deps, actor, RUN_ID);
    valid(read);
    expect(read.status).toBe(409);
    expect(read.body).toMatchObject({ trace_id: RUN_ID, data: null, error: { code: "CANCELLED" } });
  });

  it("requests cancellation of a running run: 200 cancel_requested, still 202 while it runs", async () => {
    const h = harness("running", actor.actor_id, new Date(Date.now() + 60_000).toISOString());
    const out = await h.cancel();
    valid(out);
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ state: "cancel_requested" });
    expect((await readRunResult(h.deps, actor, RUN_ID)).status).toBe(202);
  });

  it("reads a cancel_requested run whose lease expired as unknown, not as still running", async () => {
    const h = harness("cancel_requested", actor.actor_id, new Date(Date.now() - 1_000).toISOString());
    const read = await readRunResult(h.deps, actor, RUN_ID);
    expect(read.status).toBe(503);
    expect(read.body.error?.code).toBe("INCOMPLETE");
  });

  it.each(["completed", "blocked", "cancelled", "cancel_requested"] as const)(
    "leaves a %s run unchanged: 409 CONFLICT with its state",
    async (state) => {
      const h = harness(state);
      const out = await h.cancel();
      valid(out);
      expect(out.status).toBe(409);
      expect(out.body).toMatchObject({ error: { code: "CONFLICT" }, data: { id: RUN_ID, state } });
      expect(h.run.state).toBe(state);
    },
  );

  it("treats another actor's run as not found (404)", async () => {
    const h = harness("pending", "77777777-7777-4777-8777-777777777777");
    const error = await h.cancel().catch((e) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(STATUS[(error as GatewayError).code]).toBe(404);
    expect(h.run.state).toBe("pending");
  });
});
