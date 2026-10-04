import "server-only";
import type { ActorContext, GatewayPolicy } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { sha256Hex } from "./checks";
import { envelope, errorOutcome, GatewayError } from "./envelope";
import type { GatewayDeps, Outcome } from "./ports";

/** Technical spec §5: schema limits alone cannot enforce relationships between fields. */
export function validPolicyRelationships(p: GatewayPolicy) {
  const { semantic: s, execution: e, budgets: b } = p;
  return (
    Object.values(s.thresholds).every((t) => t.review < t.block) &&
    s.overlap_tokens < s.window_tokens &&
    e.max_input_utf8_bytes + e.template_token_reserve + e.max_output_tokens <= e.context_tokens &&
    e.provider_timeout_ms <= e.max_elapsed_ms &&
    e.max_identical_tool_calls <= e.max_tool_calls &&
    b.actor_generation_tokens <= b.org_generation_tokens &&
    b.actor_generation_ms <= b.org_generation_ms &&
    b.actor_semantic_tokens <= b.org_semantic_tokens &&
    b.actor_commercial_micro_usd <= b.org_commercial_micro_usd &&
    b.max_active_runs_per_actor <= b.max_active_runs_per_org
  );
}

/** Stable hash for semantically identical JSON objects, independent of key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export async function updatePolicy(
  deps: GatewayDeps,
  actor: ActorContext,
  input: unknown,
  idempotencyKey: string,
): Promise<Outcome> {
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");
  const checked = check("PolicyUpdate", input);
  if (!checked.ok) return errorOutcome("INVALID_INPUT");
  const { expected_version, policy } = checked.value;
  if (
    expected_version >= 2147483647 ||
    policy.version !== expected_version + 1 ||
    !validPolicyRelationships(policy)
  )
    return errorOutcome("INVALID_INPUT");

  // SQL rechecks active admin membership, locks the head and commits snapshot + audit atomically.
  // No read-then-write version check in JavaScript; stale versions and retries are decided in SQL.
  const result = await deps.repository.updatePolicy({
    actor,
    idempotencyKey,
    expectedVersion: expected_version,
    policy,
    requestSha256: sha256Hex(canonical(checked.value)),
    documentSha256: sha256Hex(canonical(policy)),
  });
  const body = envelope({ ...result, decision: "ALLOW", data: { version: result.policy_version } });
  if (result.policy_version !== policy.version || !check("Response", body).ok)
    throw new GatewayError("STATE_UNAVAILABLE");
  return { status: 200, body };
}
