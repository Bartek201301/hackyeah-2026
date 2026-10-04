import { describe, expect, it } from "vitest";
import policyJson from "../../../docs/contracts/policy.example.json";
import type { ActorContext, GatewayPolicy } from "@/shared/contracts";
import { updatePolicy } from "./policy-update";
import { GatewayError } from "./envelope";
import type { GatewayDeps, PolicyWrite } from "./ports";

const actor: ActorContext = {
  actor_id: "11111111-1111-4111-8111-111111111111",
  organisation_id: "22222222-2222-4222-8222-222222222222",
  role: "admin",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const key = "33333333-3333-4333-8333-333333333333";
const request = () => ({
  expected_version: 1,
  policy: { ...structuredClone(policyJson), version: 2 } as GatewayPolicy,
});
function harness(fail?: string) {
  const writes: PolicyWrite[] = [];
  const deps = {
    repository: {
      async updatePolicy(input: PolicyWrite) {
        writes.push(input);
        if (fail) throw new GatewayError(fail === "CONFLICT" ? "CONFLICT" : "STATE_UNAVAILABLE");
        return { trace_id: key, policy_version: 2, feed_version: 1 };
      },
    },
    detection: null,
    generation: null,
  } as GatewayDeps;
  return { writes, run: (input: unknown, who = actor) => updatePolicy(deps, who, input, key) };
}

describe("policy update", () => {
  it.each(["analyst", "employee", "external"] as const)("rejects %s before persistence", async (role) => {
    const h = harness();
    expect((await h.run(request(), { ...actor, role })).status).toBe(403);
    expect(h.writes).toEqual([]);
  });
  it("activates a validated new version with trusted identity and content hashes", async () => {
    const h = harness();
    const input = request();
    input.policy.semantic.chat_verification = "qwen-context-v1";
    const result = await h.run(input);
    expect(result.body).toMatchObject({ decision: "ALLOW", policy_version: 2, data: { version: 2 } });
    expect(h.writes[0]).toMatchObject({
      actor,
      idempotencyKey: key,
      expectedVersion: 1,
      policy: input.policy,
    });
    expect(h.writes[0].documentSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("hashes JSON independent of object key order for retry consistency", async () => {
    const h = harness();
    const a = request();
    await h.run(a);
    await h.run({ policy: Object.fromEntries(Object.entries(a.policy).reverse()), expected_version: 1 });
    expect(h.writes[0].requestSha256).toBe(h.writes[1].requestSha256);
  });
  const invalid: [string, (p: GatewayPolicy) => void][] = [
    [
      "threshold order",
      (p) => {
        p.semantic.thresholds.resource_abuse.review = 0.9;
      },
    ],
    [
      "overlap",
      (p) => {
        p.semantic.window_tokens = 64;
        p.semantic.overlap_tokens = 64;
      },
    ],
    [
      "context capacity",
      (p) => {
        p.execution.context_tokens = 2048;
      },
    ],
    [
      "provider timeout",
      (p) => {
        p.execution.max_elapsed_ms = 1000;
      },
    ],
    [
      "tool repetition",
      (p) => {
        p.execution.max_tool_calls = 1;
      },
    ],
    [
      "token budgets",
      (p) => {
        p.budgets.org_generation_tokens = 1;
      },
    ],
    [
      "time budgets",
      (p) => {
        p.budgets.org_generation_ms = 1;
      },
    ],
    [
      "semantic budgets",
      (p) => {
        p.budgets.org_semantic_tokens = 1;
      },
    ],
    [
      "commercial budgets",
      (p) => {
        p.budgets.org_commercial_micro_usd = 0;
      },
    ],
    [
      "active runs",
      (p) => {
        p.budgets.max_active_runs_per_org = 1;
      },
    ],
    [
      "version increment",
      (p) => {
        p.version = 3;
      },
    ],
  ];
  it.each(invalid)("rejects invalid %s before persistence", async (_, change) => {
    const h = harness();
    const input = request();
    change(input.policy);
    expect((await h.run(input)).status).toBe(400);
    expect(h.writes).toEqual([]);
  });
  it("rejects unknown fields and disabling required semantic assessment", async () => {
    const h = harness();
    expect((await h.run({ ...request(), role: "admin" })).status).toBe(400);
    const input = request();
    expect(
      (
        await h.run({
          ...input,
          policy: { ...input.policy, semantic: { ...input.policy.semantic, required: false } },
        })
      ).status,
    ).toBe(400);
    expect(h.writes).toEqual([]);
  });
  it.each(["CONFLICT", "STATE_UNAVAILABLE"])("does not return success when SQL reports %s", async (code) => {
    await expect(harness(code).run(request())).rejects.toMatchObject({ code });
  });
});
