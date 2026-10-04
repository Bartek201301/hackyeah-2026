import "server-only";

import { randomUUID } from "node:crypto";
import type { ActorContext, Finding } from "@/shared/contracts";
import { clock, createCalls, loadControls, Stop } from "./calls";
import { decide, matchSensitive, matchSignatures, sha256Hex, utf8Bytes } from "./checks";
import {
  chatAssessmentGate,
  parseSecurityVerdict,
  verificationMessages,
  verifiedDecision,
} from "./chat-verification";
import { envelope, errorOutcome, GatewayError, notExecutedUsage, SEMANTIC_UNAVAILABLE } from "./envelope";
import type { GatewayDeps, Outcome } from "./ports";

export type StandaloneStage = "mcp_input" | "mcp_output" | "claude_prompt" | "claude_tool";
export type StandaloneInput = {
  actor: ActorContext;
  tokenId: string;
  scope: "excerpt:search" | "excerpt:read" | "guard:prompt" | "guard:tool";
  stage: StandaloneStage;
  text: string;
  idempotencyKey: string;
  hardReason?: "TOOL_NOT_ALLOWED" | "PATH_NOT_ALLOWED" | "EDIT_TOO_LARGE";
};

/** A single assessment, with durable intent, budgeted Laya, and atomic final audit. */
export async function assessStandalone(deps: GatewayDeps, input: StandaloneInput): Promise<Outcome> {
  const { actor, tokenId, scope, stage, text, idempotencyKey, hardReason } = input;
  const t = clock();
  const controls = await t.time("persistence_ms", () => loadControls(deps, actor));
  if (!controls) return errorOutcome("POLICY_UNAVAILABLE");
  const { policy, feed, versions } = controls;
  const guard = policy.client_guard;
  if (!guard) return errorOutcome("POLICY_UNAVAILABLE");
  const maxBytes =
    stage === "claude_prompt"
      ? guard.max_prompt_bytes
      : stage === "claude_tool"
        ? guard.max_edit_bytes
        : policy.execution.max_input_utf8_bytes;
  if (!text || utf8Bytes(text) > maxBytes) return errorOutcome("INVALID_INPUT");
  const usage = notExecutedUsage(policy.comparison_rate.version);
  const traceId = randomUUID();
  const op = await t.time("persistence_ms", () =>
    deps.repository.beginOperation({
      actor,
      operation: stage,
      idempotencyKey,
      requestSha256: sha256Hex(text),
      traceId,
      runId: null,
    }),
  );
  if (op.replay) {
    const saved = await deps.repository.readGuardResult(actor, op.operation_id);
    if (!saved) return errorOutcome("INCOMPLETE", { trace_id: traceId, ...versions });
    if (saved.policy_version !== versions.policy_version || saved.feed_version !== versions.feed_version)
      return errorOutcome("POLICY_UNAVAILABLE", { trace_id: saved.trace_id, ...versions });
    return {
      status: saved.decision === "ALLOW" ? 200 : 403,
      body: envelope({ ...saved, semantic: SEMANTIC_UNAVAILABLE }),
    };
  }
  if (op.policy_version !== versions.policy_version || op.feed_version !== versions.feed_version)
    return errorOutcome("POLICY_UNAVAILABLE", { trace_id: traceId, ...versions });

  const findings: Finding[] = [];
  // The command hook has a 20-second HTTP deadline; leave room to finalize and answer.
  const overall = AbortSignal.timeout(Math.min(policy.execution.max_elapsed_ms, 15000));
  const calls = createCalls({ deps, actor, runId: null, policy, op, usage, t, overall, findings });
  let decision: "ALLOW" | "BLOCK" | "REVIEW" = "BLOCK";
  let reasons: string[] = [];
  let failure:
    | "SEMANTIC_UNAVAILABLE"
    | "MODEL_UNAVAILABLE"
    | "BUDGET_EXHAUSTED"
    | "INCOMPLETE"
    | "STATE_UNAVAILABLE"
    | null = null;
  try {
    const deterministic = await t.time("deterministic_ms", () => [
      ...(hardReason
        ? [{ code: hardReason, category: "policy", severity: "block" as const, stage, locator: null }]
        : []),
      ...matchSignatures(text, feed, stage),
      ...matchSensitive(text, stage),
    ]);
    findings.push(...deterministic);
    const hard = decide(deterministic, null, policy);
    if (hard.decision !== "ALLOW") {
      decision = hard.decision;
      reasons = hard.reasons;
    } else {
      const result = await calls.assess(text, stage, { audience: actor.audience });
      const gate =
        stage === "claude_prompt"
          ? chatAssessmentGate(findings, result.semantic.scores, policy)
          : decide(findings, result.semantic.scores, policy);
      if (gate) {
        decision = gate.decision;
        reasons = gate.reasons;
      } else {
        const generated = await calls.generate(
          verificationMessages(text, "chat_input"),
          "security_verification_v1",
        );
        const verdict = parseSecurityVerdict(generated.text);
        if (!verdict) throw new Stop({ error: "MODEL_UNAVAILABLE" });
        ({ decision, reasons } = verifiedDecision(verdict));
      }
    }
  } catch (error) {
    if (error instanceof Stop) {
      const code = error.end.error;
      failure =
        code === "SEMANTIC_UNAVAILABLE" ||
        code === "MODEL_UNAVAILABLE" ||
        code === "BUDGET_EXHAUSTED" ||
        code === "INCOMPLETE"
          ? code
          : "STATE_UNAVAILABLE";
    } else if (error instanceof GatewayError && error.code === "BUDGET_EXHAUSTED") {
      failure = "BUDGET_EXHAUSTED";
    } else {
      failure = "STATE_UNAVAILABLE";
    }
    decision = "BLOCK";
    reasons = [failure ? `assessment:${failure.toLowerCase()}` : "assessment:unavailable"];
  }
  const unknown = usage.unresolved_reservation || calls.open;
  let final;
  try {
    final = await t.time("persistence_ms", () =>
      deps.repository.finalizeGuardCheck({
        operationId: op.operation_id,
        actor,
        tokenId,
        scope,
        decision,
        reasons,
        usage,
        unknown,
        event: {
          stage,
          finding_codes: findings.map((f) => f.code).slice(0, 20),
          semantic_status: calls.semantic?.status ?? (failure ? "unavailable" : "not_required"),
          checkpoint_revision: calls.semantic?.checkpoint_revision ?? null,
        },
      }),
    );
  } catch {
    return errorOutcome("AUDIT_UNAVAILABLE", { trace_id: traceId, ...versions });
  }
  if (failure) return errorOutcome(failure, { trace_id: final.trace_id, ...versions });
  return {
    status: final.decision === "ALLOW" ? 200 : 403,
    body: envelope({
      trace_id: final.trace_id,
      policy_version: final.policy_version,
      feed_version: final.feed_version,
      decision: final.decision,
      reasons: final.reasons,
      semantic: calls.semantic ?? SEMANTIC_UNAVAILABLE,
      usage,
      timings: t.timings(),
    }),
  };
}
