/*
 * Policy administration form.
 *
 * The field list comes from the frozen policy schema, so the form is buildable before
 * `GET /policy` exists. Values come from the server; docs/contracts/policy.example.json supplies
 * *initial* values only and must never be baked in as UI constants.
 *
 * `checkPolicyInvariants` is a HINT, not a validator. docs/product/technical-spec.md §5 keeps
 * business validation in the gateway, and this must never become a second policy engine: it exists
 * so an administrator sees an obvious mistake before a round trip, and it deliberately reports the
 * same rules the server will enforce rather than inventing extra ones.
 *
 * There is intentionally no control anywhere here that can disable required semantic assessment,
 * trusted access checks or budgets. DESIGN forbids a bypass toggle.
 */
import type { GatewayPolicy } from "@/shared/contracts";

export type PolicySection = {
  key: "imports" | "semantic" | "execution" | "budgets" | "comparison_rate" | "retention";
  title: string;
  description: string;
};

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    key: "imports",
    title: "Imports",
    description: "Accepted formats and the bounds applied to every uploaded or connected file.",
  },
  {
    key: "semantic",
    title: "Semantic assessment",
    description:
      "Required content assessment, its coverage windows and the per-risk review and block thresholds.",
  },
  {
    key: "execution",
    title: "Execution",
    description: "Generation model bounds, loop ceilings and registered tools.",
  },
  {
    key: "budgets",
    title: "Budgets",
    description: "Per-actor and per-organisation allowances for the current period.",
  },
  {
    key: "comparison_rate",
    title: "Comparison rate",
    description: "Illustrative commercial equivalent. Not an invoice and not a real charge.",
  },
  {
    key: "retention",
    title: "Retention",
    description: "How long raw originals, audit records, exports and reviews are kept.",
  },
];

export const RISK_KEYS = ["instruction_manipulation", "sensitive_exposure", "resource_abuse"] as const;
export type RiskKey = (typeof RISK_KEYS)[number];

export const RISK_LABELS: Record<RiskKey, string> = {
  instruction_manipulation: "Instruction manipulation",
  sensitive_exposure: "Sensitive exposure",
  resource_abuse: "Resource abuse",
};

export type Invariant = {
  /** Dotted path into the policy document, for associating the message with a control. */
  path: string;
  message: string;
};

/**
 * Report the business rules from technical-spec §5 that the submitted document would break.
 * An empty array means "nothing obvious is wrong", never "this is valid".
 */
export function checkPolicyInvariants(policy: GatewayPolicy): Invariant[] {
  const problems: Invariant[] = [];
  const { semantic, execution, budgets } = policy;

  if (semantic.required !== true) {
    problems.push({
      path: "semantic.required",
      message: "Semantic assessment cannot be switched off.",
    });
  }

  for (const risk of RISK_KEYS) {
    const t = semantic.thresholds[risk];
    if (t && t.review >= t.block) {
      problems.push({
        path: `semantic.thresholds.${risk}`,
        message: `${RISK_LABELS[risk]}: the review threshold must be below the block threshold.`,
      });
    }
  }

  if (semantic.overlap_tokens >= semantic.window_tokens) {
    problems.push({
      path: "semantic.overlap_tokens",
      message: "Window overlap must be smaller than the window itself.",
    });
  }
  if (semantic.window_tokens > semantic.context_tokens) {
    problems.push({
      path: "semantic.window_tokens",
      message: "A window cannot exceed the assessment context.",
    });
  }

  // §8: the conservative input bound plus template reserve plus output cap must fit the context.
  const worstCaseInput = execution.max_input_utf8_bytes;
  if (
    worstCaseInput + execution.template_token_reserve + execution.max_output_tokens >
    execution.context_tokens
  ) {
    problems.push({
      path: "execution.max_input_utf8_bytes",
      message: "Input bound, template reserve and output cap must fit inside the generation context.",
    });
  }

  if (execution.max_identical_tool_calls > execution.max_tool_calls) {
    problems.push({
      path: "execution.max_identical_tool_calls",
      message: "The identical-call ceiling cannot exceed the total tool-call ceiling.",
    });
  }

  const budgetPairs: ReadonlyArray<[keyof typeof budgets, keyof typeof budgets, string]> = [
    ["actor_generation_tokens", "org_generation_tokens", "generation tokens"],
    ["actor_generation_ms", "org_generation_ms", "generation time"],
    ["actor_semantic_tokens", "org_semantic_tokens", "semantic tokens"],
    ["actor_commercial_micro_usd", "org_commercial_micro_usd", "commercial equivalent"],
  ];
  for (const [actorKey, orgKey, label] of budgetPairs) {
    const actor = budgets[actorKey];
    const org = budgets[orgKey];
    if (typeof actor === "number" && typeof org === "number" && org < actor) {
      problems.push({
        path: `budgets.${String(orgKey)}`,
        message: `The organisation allowance for ${label} must be at least the per-actor allowance.`,
      });
    }
  }

  if (budgets.max_active_runs_per_org < budgets.max_active_runs_per_actor) {
    problems.push({
      path: "budgets.max_active_runs_per_org",
      message: "The organisation run limit must be at least the per-actor run limit.",
    });
  }

  return problems;
}

/**
 * Compare-and-swap submission.
 *
 * technical-spec §5: "Persist immutable snapshots and CAS head update. Version supplied must equal
 * expected+1." So `expected_version` is the head the client believes is current — the version it
 * loaded — and the submitted *document's* own `version` is that head plus one. Sending the
 * incremented value as `expected_version` would compare against a version that does not exist yet.
 *
 * Still listed as B12 in Julian/plans/02-open-questions.md: the two fields need confirming against
 * the real endpoint, because OpenAPI alone does not say which is which.
 */
export function nextPolicyVersion(loadedVersion: number): number {
  return loadedVersion + 1;
}

export type PolicySubmission = { expected_version: number; policy: GatewayPolicy };

/** Build the update: CAS against the loaded head, document version incremented. */
export function toPolicySubmission(loaded: GatewayPolicy, edited: GatewayPolicy): PolicySubmission {
  return {
    expected_version: loaded.version,
    policy: { ...edited, version: nextPolicyVersion(loaded.version) },
  };
}

export type FeedIndicatorKind = "literal" | "domain";
export const FEED_KINDS: readonly FeedIndicatorKind[] = ["literal", "domain"];
export const FEED_CATEGORIES = ["prompt_injection", "exfiltration", "unsafe_code", "resource_abuse"] as const;
export const FEED_ACTIONS = ["REVIEW", "BLOCK"] as const;

/** A feed whose expiry has passed withholds protected operations until a valid one is installed. */
export function isFeedExpired(expiresAt: string, now: Date = new Date()): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isNaN(expiry) ? true : expiry <= now.getTime();
}
