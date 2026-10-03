import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "@/shared/contracts/validate";
import type { GatewayPolicy } from "@/shared/contracts";
import {
  POLICY_SECTIONS,
  RISK_KEYS,
  checkPolicyInvariants,
  isFeedExpired,
  nextPolicyVersion,
} from "./policyForm";

/*
 * The shipped example is read as *a* valid document to exercise the hints against, never copied
 * into the form as a default. docs/README.md: the policy example owns default values and they must
 * not be duplicated into feature logic.
 */
const example = (): GatewayPolicy => {
  const raw: unknown = JSON.parse(
    readFileSync(new URL("../../../../docs/contracts/policy.example.json", import.meta.url), "utf8"),
  );
  const result = check("GatewayPolicy", raw);
  if (!result.ok) throw new Error(`policy example is invalid: ${result.errors.join("; ")}`);
  return result.value;
};

const clone = (p: GatewayPolicy): GatewayPolicy => JSON.parse(JSON.stringify(p)) as GatewayPolicy;

describe("sections", () => {
  it("covers every top-level policy group the schema requires", () => {
    const keys = POLICY_SECTIONS.map((s) => s.key).sort();
    expect(keys).toEqual(["budgets", "comparison_rate", "execution", "imports", "retention", "semantic"]);
  });

  it("labels the comparison rate as illustrative, not a charge", () => {
    const section = POLICY_SECTIONS.find((s) => s.key === "comparison_rate");
    expect(section?.description).toMatch(/not an invoice/i);
  });
});

describe("checkPolicyInvariants", () => {
  it("reports nothing for the shipped example", () => {
    expect(checkPolicyInvariants(example())).toEqual([]);
  });

  it("refuses to let required assessment be switched off", () => {
    const p = clone(example());
    // The schema pins `required` to const true, so TypeScript already forbids this. The runtime
    // guard still matters: a policy document arrives over the network as untrusted data.
    (p.semantic as { required: boolean }).required = false;
    expect(checkPolicyInvariants(p).map((i) => i.path)).toContain("semantic.required");
  });

  it("requires every review threshold below its block threshold", () => {
    for (const risk of RISK_KEYS) {
      const p = clone(example());
      p.semantic.thresholds[risk].review = p.semantic.thresholds[risk].block;
      expect(checkPolicyInvariants(p).map((i) => i.path)).toContain(`semantic.thresholds.${risk}`);
    }
  });

  it("requires overlap below the window and the window inside the context", () => {
    const overlap = clone(example());
    overlap.semantic.overlap_tokens = overlap.semantic.window_tokens;
    expect(checkPolicyInvariants(overlap).map((i) => i.path)).toContain("semantic.overlap_tokens");

    const window = clone(example());
    window.semantic.window_tokens = window.semantic.context_tokens + 1;
    expect(checkPolicyInvariants(window).map((i) => i.path)).toContain("semantic.window_tokens");
  });

  it("requires the input bound, template reserve and output cap to fit the context", () => {
    const p = clone(example());
    p.execution.max_input_utf8_bytes = p.execution.context_tokens;
    expect(checkPolicyInvariants(p).map((i) => i.path)).toContain("execution.max_input_utf8_bytes");
  });

  it("keeps the identical-call ceiling at or below the total", () => {
    const p = clone(example());
    p.execution.max_identical_tool_calls = p.execution.max_tool_calls + 1;
    expect(checkPolicyInvariants(p).map((i) => i.path)).toContain("execution.max_identical_tool_calls");
  });

  it("requires organisation allowances to be at least the per-actor allowance", () => {
    const pairs = [
      ["actor_generation_tokens", "org_generation_tokens"],
      ["actor_generation_ms", "org_generation_ms"],
      ["actor_semantic_tokens", "org_semantic_tokens"],
      ["actor_commercial_micro_usd", "org_commercial_micro_usd"],
    ] as const;
    for (const [actorKey, orgKey] of pairs) {
      const p = clone(example());
      p.budgets[orgKey] = p.budgets[actorKey] - 1;
      expect(
        checkPolicyInvariants(p).map((i) => i.path),
        orgKey,
      ).toContain(`budgets.${orgKey}`);
    }
  });

  it("requires the organisation run limit to be at least the per-actor limit", () => {
    const p = clone(example());
    p.budgets.max_active_runs_per_org = p.budgets.max_active_runs_per_actor - 1;
    expect(checkPolicyInvariants(p).map((i) => i.path)).toContain("budgets.max_active_runs_per_org");
  });

  it("reports several problems at once rather than stopping at the first", () => {
    const p = clone(example());
    (p.semantic as { required: boolean }).required = false;
    p.semantic.overlap_tokens = p.semantic.window_tokens;
    expect(checkPolicyInvariants(p).length).toBeGreaterThanOrEqual(2);
  });
});

describe("compare-and-swap", () => {
  it("submits exactly the loaded head plus one", () => {
    expect(nextPolicyVersion(1)).toBe(2);
    expect(nextPolicyVersion(7)).toBe(8);
  });
});

describe("isFeedExpired", () => {
  const now = new Date("2026-10-03T16:00:00Z");

  it("treats a past or equal expiry as expired", () => {
    expect(isFeedExpired("2026-10-03T15:59:59Z", now)).toBe(true);
    expect(isFeedExpired("2026-10-03T16:00:00Z", now)).toBe(true);
  });

  it("accepts a future expiry", () => {
    expect(isFeedExpired("2026-10-04T00:00:00Z", now)).toBe(false);
  });

  it("fails closed on an unparseable timestamp", () => {
    expect(isFeedExpired("not a date", now)).toBe(true);
    expect(isFeedExpired("", now)).toBe(true);
  });
});
