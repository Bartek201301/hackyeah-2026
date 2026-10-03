import { describe, expect, it } from "vitest";
import policyJson from "../../../../docs/contracts/policy.example.json";
import type { Finding, GatewayPolicy, ThreatFeed } from "@/shared/contracts";
import {
  counts,
  minimumReviewMargin,
  proposeThresholds,
  replay,
  scoreRanges,
  type Attempt,
  type Category,
} from "./core";
import { renderReport } from "./report";

const policy = policyJson as GatewayPolicy;
const low = { instruction_manipulation: 0.1, sensitive_exposure: 0.1, resource_abuse: 0.1 };
const blockFinding: Finding = {
  code: "SIG-001",
  category: "prompt_injection",
  severity: "block",
  stage: "input_signature",
  locator: null,
};

function attempt(caseId: string, category: Category, split: Attempt["split"] = "development"): Attempt {
  return {
    run_id: "00000000-0000-4000-8000-000000000001",
    case_id: caseId,
    category,
    split,
    input_findings: [],
    output_findings: [],
    input: {
      scores: category === "attack" ? { ...low, instruction_manipulation: 0.8 } : low,
      checkpoint_revision: "revision",
      text_sha256: "input-hash",
      semantic_input_tokens: 100,
      semantic_ms: 1,
      windows_completed: 1,
    },
    output: {
      scores: category === "attack" ? low : { ...low, sensitive_exposure: 0.35 },
      checkpoint_revision: "revision",
      text_sha256: "output-hash",
      semantic_input_tokens: 100,
      semantic_ms: 1,
      windows_completed: 1,
    },
    generation: {
      input_tokens: 20,
      output_tokens: 10,
      duration_ms: 3,
      model_digest: "digest",
      output_sha256: "output-hash",
      output_utf8_bytes: 10,
      tool_count: 0,
    },
    status: "complete",
    error_code: null,
  };
}

const development = [
  ...Array.from({ length: 4 }, (_, n) => ({
    id: `development-benign-0${n + 1}`,
    category: "benign" as const,
  })),
  ...Array.from({ length: 4 }, (_, n) => ({
    id: `development-attack-0${n + 1}`,
    category: "attack" as const,
  })),
  ...Array.from({ length: 4 }, (_, n) => ({
    id: `development-hard_benign-0${n + 1}`,
    category: "hard_benign" as const,
  })),
].flatMap(({ id, category }) => Array.from({ length: 10 }, () => attempt(id, category)));

describe("T04 synthetic evaluation", () => {
  it("stops replay at the first blocking stage", () => {
    const case_ = attempt("development-attack-01", "attack");
    case_.input_findings = [blockFinding];
    expect(replay(case_, policy)).toMatchObject({ decision: "BLOCK", stage: "input_signature" });
    case_.input_findings = [];
    expect(replay(case_, policy)).toMatchObject({ decision: "BLOCK", stage: "input_semantic" });
    case_.input!.scores = low;
    case_.output!.scores = { ...low, sensitive_exposure: 0.35 };
    expect(replay(case_, policy)).toMatchObject({ decision: "REVIEW", stage: "output_semantic" });
  });

  it("chooses a five-point margin without adding attack ALLOWs", () => {
    const choice = proposeThresholds(development, policy);
    expect(choice.thresholds?.sensitive_exposure.review).toBe(0.4);
    expect(choice.thresholds?.sensitive_exposure.block).toBe(
      policy.semantic.thresholds.sensitive_exposure.block,
    );
    expect(choice.baseline_reliable_benign_cases).toBe(0);
    expect(choice.proposed_reliable_benign_cases).toBe(8);
    const adjusted = { ...policy, semantic: { ...policy.semantic, thresholds: choice.thresholds! } };
    expect(counts(development, adjusted).attack.allow).toBe(0);
    expect(minimumReviewMargin(development[0], adjusted.semantic.thresholds)).toBeCloseTo(0.05);
    const ranges = scoreRanges(development) as Record<
      string,
      Record<string, Record<string, { max: number }>>
    >;
    expect(ranges.benign.output.sensitive_exposure.max).toBe(0.35);
  });

  it("rejects held-out or incomplete data before threshold selection", () => {
    expect(() =>
      proposeThresholds(
        [...development.slice(0, -1), attempt("held_out-benign-01", "benign", "held_out")],
        policy,
      ),
    ).toThrow("development_batch_incomplete");
    const incomplete = structuredClone(development);
    incomplete[0].status = "incomplete";
    expect(() => proposeThresholds(incomplete, policy)).toThrow("development_batch_incomplete");
  });

  it("reports counts and scores without serialising generated text or feed values", () => {
    const choice = proposeThresholds(development, policy);
    const demo = Array.from({ length: 3 }, (_, n) =>
      Array.from({ length: 10 }, () => attempt(`demo-${n + 1}`, "benign", "demo")),
    ).flat();
    const heldout = [
      ...Array.from({ length: 4 }, (_, n) => attempt(`held_out-benign-0${n + 1}`, "benign", "held_out")),
      ...Array.from({ length: 4 }, (_, n) => attempt(`held_out-attack-0${n + 1}`, "attack", "held_out")),
      ...Array.from({ length: 4 }, (_, n) =>
        attempt(`held_out-hard_benign-0${n + 1}`, "hard_benign", "held_out"),
      ),
    ];
    const tainted = demo[0] as Attempt & { generated_text: string };
    tainted.generated_text = "SENSITIVE_SENTINEL";
    const controls = {
      policy,
      feed: { indicators: [{ value: "SENSITIVE_SENTINEL" }] } as unknown as ThreatFeed,
      policy_version: 1,
      feed_version: 1,
      feed_expires_at: "2099-01-01T00:00:00Z",
    };
    const lock = {
      at: "2026-10-03T00:00:00Z",
      labels_reviewed_by: "Julian",
      corpus_sha256: "hash",
      controls_sha256: "hash",
      source_sha256: "hash",
      demo_sha256: "hash",
      development_sha256: "hash",
      demo_results_sha256: "hash",
      policy_version: 1,
      feed_version: 1,
      laya_revision: "revision",
      ollama_digest: "digest",
      baseline_thresholds: policy.semantic.thresholds,
      proposed_thresholds: choice.thresholds,
    };
    const report = renderReport({ development, demo, heldout, controls, lock });
    expect(report).not.toContain("SENSITIVE_SENTINEL");
    expect(report).toContain("harmful ALLOW 0/4");
    heldout[0].status = "incomplete";
    expect(() => renderReport({ development, demo, heldout, controls, lock })).toThrow(
      "report_batch_incomplete",
    );
  });
});
