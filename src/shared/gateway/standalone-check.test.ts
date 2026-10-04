import { describe, expect, it } from "vitest";
import policyJson from "../../../docs/contracts/policy.example.json";
import feedJson from "../../../docs/contracts/threat-feed.example.json";
import manifest from "@/shared/contracts/runtime-manifest.json";
import type { ActorContext, Assessment, DetectionPort, GenerationPort } from "@/shared/contracts";
import { sha256Hex } from "./checks";
import { GatewayError } from "./envelope";
import type { GatewayDeps, RepositoryPort } from "./ports";
import { assessStandalone } from "./standalone-check";

const actor: ActorContext = {
  actor_id: "actor",
  organisation_id: "org",
  role: "employee",
  deal_ids: [],
  audience: "public",
  scopes: ["guard:prompt"],
};
const input = {
  actor,
  tokenId: "token",
  scope: "guard:prompt" as const,
  stage: "claude_prompt" as const,
  text: "Please explain the public source.",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
};
const policy = {
  ...policyJson,
  client_guard: {
    profile: "restricted-demo-v1",
    prompt_assessment_required: true,
    allowed_tools: ["Read", "Edit", "Write"],
    editable_root: "src",
    editable_extensions: [".ts"],
    max_prompt_bytes: 6000,
    max_edit_bytes: 2000,
  },
};

function harness(
  options: {
    budget?: boolean;
    providerFails?: boolean;
    auditFails?: boolean;
    finalDecision?: "ALLOW" | "BLOCK";
    replay?: boolean;
    opVersion?: number;
    verificationEnabled?: boolean;
    scores?: Partial<Assessment["scores"]>;
    verifierUncertain?: boolean;
  } = {},
) {
  const log: string[] = [];
  const verificationOperations: string[] = [];
  const final: Parameters<RepositoryPort["finalizeGuardCheck"]>[0][] = [];
  const repository = {
    async loadActivePolicyAndFeed() {
      return {
        policy: options.verificationEnabled
          ? { ...policy, semantic: { ...policy.semantic, chat_verification: "qwen-context-v1" } }
          : policy,
        feed: feedJson,
        policy_version: 4,
        feed_version: 2,
        feed_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      };
    },
    async beginOperation() {
      log.push("intent");
      return {
        operation_id: "op",
        state: "intent",
        replay: options.replay ?? false,
        policy_version: options.opVersion ?? 4,
        feed_version: 2,
      };
    },
    async readGuardResult() {
      return {
        trace_id: "trace",
        decision: "ALLOW",
        reasons: [],
        usage: {} as never,
        policy_version: 4,
        feed_version: 2,
      };
    },
    async reserveCall() {
      log.push("reserve");
      if (options.budget) throw new GatewayError("BUDGET_EXHAUSTED");
    },
    async finishCall(_id: string, actuals: unknown) {
      log.push(`finish:${JSON.stringify(actuals)}`);
      return { settled: 1, unresolved: 0, overrun: false };
    },
    async finalizeGuardCheck(value: Parameters<RepositoryPort["finalizeGuardCheck"]>[0]) {
      log.push("finalize");
      final.push(value);
      if (options.auditFails) throw new Error("audit down");
      return {
        trace_id: "trace",
        decision: options.finalDecision ?? value.decision,
        reasons: value.reasons,
        policy_version: 4,
        feed_version: 2,
      };
    },
  } as unknown as RepositoryPort;
  const detection: DetectionPort = {
    async parse() {
      throw new Error("unused");
    },
    async assess(value) {
      log.push("assess");
      if (options.providerFails) throw new Error("model unavailable");
      const semantic: Assessment = {
        status: "complete",
        scores: {
          instruction_manipulation: 0.01,
          sensitive_exposure: 0.01,
          resource_abuse: 0.01,
          ...options.scores,
        },
        checkpoint_revision: manifest.laya_checkpoint_revision,
        windows_planned: 1,
        windows_completed: 1,
        coverage_complete: true,
        text_sha256: sha256Hex(value.text),
        coverage_ranges: [{ start_char: 0, end_char: [...value.text].length, input_tokens: 20 }],
      };
      return { findings: [], semantic, semantic_input_tokens: 20, semantic_ms: 10 };
    },
  };
  const generation: GenerationPort = {
    async generate(request) {
      log.push("generate");
      verificationOperations.push(JSON.parse(request.messages.at(-1)?.content ?? "{}").operation);
      return {
        text: JSON.stringify({
          instruction_manipulation: false,
          sensitive_exposure: false,
          resource_abuse: false,
          uncertain: options.verifierUncertain ?? false,
        }),
        tool_calls: [],
        input_tokens: 40,
        output_tokens: 20,
        duration_ms: 50,
        model_digest: manifest.ollama_model_digest,
        finished: true,
      };
    },
  };
  const deps = { repository, detection, generation } as GatewayDeps;
  return { deps, log, final, verificationOperations };
}

describe("standalone guard assessment", () => {
  it("records intent and reserves before live assessment, then persists before allow", async () => {
    const h = harness();
    const result = await assessStandalone(h.deps, input);
    expect(result.body.decision).toBe("ALLOW");
    expect(h.log).toEqual([
      "intent",
      "reserve",
      "assess",
      'finish:[{"unit":"semantic_tokens","actual":20}]',
      "finalize",
    ]);
    expect(JSON.stringify(h.final[0])).not.toContain(input.text);
  });
  it("budget exhaustion and provider timeout never dispatch or release unrecorded work", async () => {
    const budget = harness({ budget: true });
    expect((await assessStandalone(budget.deps, input)).body.decision).not.toBe("ALLOW");
    expect(budget.log).toEqual(["intent", "reserve", "finalize"]);
    const failed = harness({ providerFails: true });
    const result = await assessStandalone(failed.deps, input);
    expect(result.body.decision).not.toBe("ALLOW");
    expect(failed.final[0]?.unknown).toBe(true);
    expect(failed.final[0]?.usage.unresolved_reservation).toBe(true);
  });
  it("deterministic denial skips the model; audit failure and policy change withhold allow", async () => {
    const denied = harness();
    const result = await assessStandalone(denied.deps, { ...input, hardReason: "TOOL_NOT_ALLOWED" });
    expect(result.body.decision).toBe("BLOCK");
    expect(denied.log).toEqual(["intent", "finalize"]);
    const unavailable = harness({ auditFails: true });
    expect((await assessStandalone(unavailable.deps, input)).body.error?.code).toBe("AUDIT_UNAVAILABLE");
    const changed = harness({ finalDecision: "BLOCK" });
    expect((await assessStandalone(changed.deps, input)).body.decision).toBe("BLOCK");
    const stale = harness({ opVersion: 5 });
    expect((await assessStandalone(stale.deps, input)).body.error?.code).toBe("POLICY_UNAVAILABLE");
    expect(stale.log).toEqual(["intent", "finalize"]);
  });
  it("replays a completed decision without a second provider call", async () => {
    const h = harness({ replay: true });
    expect((await assessStandalone(h.deps, input)).body.decision).toBe("ALLOW");
    expect(h.log).toEqual(["intent"]);
  });

  it("allows an MCP input REVIEW-band score after bounded verification allows it", async () => {
    const h = harness({ verificationEnabled: true, scores: { instruction_manipulation: 0.4 } });
    const result = await assessStandalone(h.deps, {
      ...input,
      stage: "mcp_input",
      scope: "excerpt:search",
    });
    expect(result.body.decision).toBe("ALLOW");
    expect(h.final[0]?.decision).toBe("ALLOW");
    expect(h.verificationOperations).toEqual(["chat_input"]);
    expect(h.log).toContain("generate");
  });

  it("keeps an MCP output in REVIEW when bounded verification is uncertain", async () => {
    const h = harness({
      verificationEnabled: true,
      scores: { instruction_manipulation: 0.4 },
      verifierUncertain: true,
    });
    const result = await assessStandalone(h.deps, {
      ...input,
      stage: "mcp_output",
      scope: "excerpt:read",
    });
    expect(result.body.decision).toBe("REVIEW");
    expect(h.final[0]?.decision).toBe("REVIEW");
    expect(h.verificationOperations).toEqual(["chat_output"]);
  });

  it("keeps a Claude tool REVIEW-band score without calling verification", async () => {
    const h = harness({ verificationEnabled: true, scores: { instruction_manipulation: 0.4 } });
    const result = await assessStandalone(h.deps, {
      ...input,
      stage: "claude_tool",
      scope: "guard:tool",
    });
    expect(result.body.decision).toBe("REVIEW");
    expect(h.final[0]?.decision).toBe("REVIEW");
    expect(h.log).not.toContain("generate");
  });

  it("blocks a strong Laya MCP input score without calling verification", async () => {
    const h = harness({ verificationEnabled: true, scores: { instruction_manipulation: 0.8 } });
    const result = await assessStandalone(h.deps, {
      ...input,
      stage: "mcp_input",
      scope: "excerpt:search",
    });
    expect(result.body.decision).toBe("BLOCK");
    expect(h.final[0]?.decision).toBe("BLOCK");
    expect(h.log).not.toContain("generate");
  });
});
