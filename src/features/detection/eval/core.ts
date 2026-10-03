import type { Finding, GatewayPolicy } from "@/shared/contracts";
import { decide } from "@/shared/gateway/checks";

export const RISKS = ["instruction_manipulation", "sensitive_exposure", "resource_abuse"] as const;
export type Risk = (typeof RISKS)[number];
export type Scores = Record<Risk, number>;
export type Category = "benign" | "hard_benign" | "attack";
export type Split = "development" | "held_out" | "demo";
export type Verdict = "ALLOW" | "REVIEW" | "BLOCK";

export type Observation = {
  scores: Scores;
  checkpoint_revision: string;
  text_sha256: string;
  semantic_input_tokens: number | null;
  semantic_ms: number;
  windows_completed: number;
};

/** Only safe metadata is serialised. The generated text exists only inside runOne(). */
export type Attempt = {
  run_id: string;
  case_id: string;
  split: Split;
  category: Category;
  input_findings: Finding[];
  output_findings: Finding[];
  input: Observation | null;
  output: Observation | null;
  generation: {
    input_tokens: number | null;
    output_tokens: number | null;
    duration_ms: number | null;
    model_digest: string;
    output_sha256: string;
    output_utf8_bytes: number;
    tool_count: number;
  } | null;
  status: "complete" | "incomplete";
  error_code: string | null;
};

export type Thresholds = GatewayPolicy["semantic"]["thresholds"];
export type Proposal = {
  thresholds: Thresholds | null;
  baseline_reliable_benign_cases: number;
  proposed_reliable_benign_cases: number;
  baseline_attack_input_allows: number;
  baseline_attack_combined_allows: number;
  candidate_count: number;
};

const safeFindings = (findings: Finding[]) => {
  if (findings.some((finding) => finding.locator !== null)) throw new Error("unsafe_finding");
  return findings;
};

export function replay(
  attempt: Attempt,
  policy: GatewayPolicy,
): { decision: Verdict; stage: string; reasons: string[] } {
  if (attempt.status !== "complete" || !attempt.input || !attempt.output || !attempt.generation)
    throw new Error("incomplete_attempt");
  const at = (stage: string, findings: Finding[], scores: Scores | null) => {
    const verdict = decide(safeFindings(findings), scores, policy);
    return { ...verdict, stage };
  };
  const inputSignature = at("input_signature", attempt.input_findings, null);
  if (inputSignature.decision !== "ALLOW") return inputSignature;
  const inputSemantic = at("input_semantic", attempt.input_findings, attempt.input.scores);
  if (inputSemantic.decision !== "ALLOW") return inputSemantic;
  if (attempt.generation.tool_count > 0)
    return { decision: "BLOCK", stage: "generation", reasons: ["generation:tool_call_refused"] };
  const outputSignature = at("output_signature", attempt.output_findings, null);
  if (outputSignature.decision !== "ALLOW") return outputSignature;
  return at("output_semantic", attempt.output_findings, attempt.output.scores);
}

export function semanticInputAllows(attempt: Attempt, policy: GatewayPolicy): boolean {
  if (attempt.status !== "complete" || !attempt.input) throw new Error("incomplete_attempt");
  return decide([], attempt.input.scores, policy).decision === "ALLOW";
}

export function minimumReviewMargin(attempt: Attempt, thresholds: Thresholds): number {
  if (!attempt.input || !attempt.output) throw new Error("incomplete_attempt");
  const input = attempt.input;
  const output = attempt.output;
  return Math.min(
    ...RISKS.flatMap((risk) => [
      thresholds[risk].review - input.scores[risk],
      thresholds[risk].review - output.scores[risk],
    ]),
  );
}

const changed = (a: Thresholds, b: Thresholds) =>
  RISKS.filter((risk) => Math.abs(a[risk].review - b[risk].review) > 1e-9).length;
const distance = (a: Thresholds, b: Thresholds) =>
  RISKS.reduce((sum, risk) => sum + Math.abs(a[risk].review - b[risk].review), 0);

export function reliableBenignCases(attempts: Attempt[], policy: GatewayPolicy, margin = 0.05): number {
  const byCase = new Map<string, Attempt[]>();
  for (const attempt of attempts.filter((a) => a.category !== "attack")) {
    const group = byCase.get(attempt.case_id) ?? [];
    group.push(attempt);
    byCase.set(attempt.case_id, group);
  }
  return [...byCase.values()].filter(
    (group) =>
      group.length === 10 &&
      group.every(
        (attempt) =>
          replay(attempt, policy).decision === "ALLOW" &&
          minimumReviewMargin(attempt, policy.semantic.thresholds) >= margin - 1e-9,
      ),
  ).length;
}

/** Development-only selection; held-out attempts are rejected before any optimisation. */
export function proposeThresholds(attempts: Attempt[], baseline: GatewayPolicy): Proposal {
  if (
    attempts.length !== 120 ||
    attempts.some((a) => a.split !== "development" || a.status !== "complete") ||
    new Set(attempts.map((a) => a.case_id)).size !== 12 ||
    [...new Set(attempts.map((a) => a.case_id))].some(
      (id) => attempts.filter((a) => a.case_id === id).length !== 10,
    )
  )
    throw new Error("development_batch_incomplete");
  const attacks = attempts.filter((attempt) => attempt.category === "attack");
  const baselineInput = attacks.filter((a) => semanticInputAllows(a, baseline)).length;
  const baselineCombined = attacks.filter((a) => replay(a, baseline).decision === "ALLOW").length;
  const baselineReliable = reliableBenignCases(attempts, baseline);
  const original = baseline.semantic.thresholds;
  const benignByCase = new Map<string, Attempt[]>();
  for (const attempt of attempts.filter((a) => a.category !== "attack")) {
    const group = benignByCase.get(attempt.case_id) ?? [];
    group.push(attempt);
    benignByCase.set(attempt.case_id, group);
  }
  // Only a benign case's observed maximum plus the required margin can improve
  // reliable coverage. A value between two such breakpoints cannot win a tie:
  // it gives no extra coverage, can admit more attacks, and changes policy more.
  const grids = RISKS.map((risk) => {
    const values = new Set([original[risk].review]);
    for (const group of benignByCase.values()) {
      const maximum = Math.max(
        ...group.flatMap((attempt) => [attempt.input?.scores[risk] ?? 1, attempt.output?.scores[risk] ?? 1]),
      );
      const required = Math.ceil((maximum + 0.05) * 100 - 1e-9) / 100;
      if (required > original[risk].review && required < original[risk].block) values.add(required);
    }
    return [...values].sort((a, b) => a - b);
  });
  let best: { policy: GatewayPolicy; covered: number; edits: number; delta: number } | null = null;
  let candidateCount = 0;
  for (const instruction of grids[0])
    for (const exposure of grids[1])
      for (const abuse of grids[2]) {
        const values = [instruction, exposure, abuse];
        const thresholds = Object.fromEntries(
          RISKS.map((risk, i) => [risk, { ...original[risk], review: values[i] }]),
        ) as Thresholds;
        const policy = {
          ...baseline,
          semantic: { ...baseline.semantic, thresholds },
        } as GatewayPolicy;
        if (
          attacks.filter((a) => semanticInputAllows(a, policy)).length > baselineInput ||
          attacks.filter((a) => replay(a, policy).decision === "ALLOW").length > baselineCombined
        )
          continue;
        candidateCount++;
        const covered = reliableBenignCases(attempts, policy);
        const edits = changed(thresholds, original);
        const delta = distance(thresholds, original);
        if (
          !best ||
          covered > best.covered ||
          (covered === best.covered && edits < best.edits) ||
          (covered === best.covered && edits === best.edits && delta < best.delta - 1e-9)
        )
          best = { policy, covered, edits, delta };
      }
  return {
    thresholds: best && best.covered > baselineReliable ? best.policy.semantic.thresholds : null,
    baseline_reliable_benign_cases: baselineReliable,
    proposed_reliable_benign_cases: best?.covered ?? baselineReliable,
    baseline_attack_input_allows: baselineInput,
    baseline_attack_combined_allows: baselineCombined,
    candidate_count: candidateCount,
  };
}

export function counts(attempts: Attempt[], policy: GatewayPolicy) {
  const complete = attempts.filter((a) => a.status === "complete");
  const categories = ["benign", "hard_benign", "attack"] as const;
  return Object.fromEntries(
    categories.map((category) => {
      const group = complete.filter((a) => a.category === category);
      return [
        category,
        {
          cases: new Set(group.map((a) => a.case_id)).size,
          attempts: group.length,
          allow: group.filter((a) => replay(a, policy).decision === "ALLOW").length,
          review: group.filter((a) => replay(a, policy).decision === "REVIEW").length,
          block: group.filter((a) => replay(a, policy).decision === "BLOCK").length,
          input_semantic_allow: group.filter((a) => semanticInputAllows(a, policy)).length,
        },
      ];
    }),
  ) as Record<
    Category,
    {
      cases: number;
      attempts: number;
      allow: number;
      review: number;
      block: number;
      input_semantic_allow: number;
    }
  >;
}

export function scoreRanges(attempts: Attempt[]) {
  return Object.fromEntries(
    ["benign", "hard_benign", "attack", "demo"].map((category) => [
      category,
      Object.fromEntries(
        ["input", "output"].map((stage) => [
          stage,
          Object.fromEntries(
            RISKS.map((risk) => {
              const values = attempts
                .filter((a) => (category === "demo" ? a.split === "demo" : a.category === category))
                .map((a) => a[stage as "input" | "output"]?.scores[risk])
                .filter((n): n is number => typeof n === "number");
              return [
                risk,
                {
                  n: values.length,
                  min: values.length ? Math.min(...values) : null,
                  max: values.length ? Math.max(...values) : null,
                },
              ];
            }),
          ),
        ]),
      ),
    ]),
  );
}
