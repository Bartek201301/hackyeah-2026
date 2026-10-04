import "server-only";
import type { Assessment, Finding, GatewayPolicy, ModelMessage, SecurityVerdict } from "@/shared/contracts";
import rubric from "@/shared/contracts/security-verification.json";
import { check } from "@/shared/contracts/validate";
import { decide } from "./checks";

// Protocol v2: a measured ceiling, not a probability or permission. Changing it requires a new
// protocol and development + fresh validation evidence. Imports/exports never use this resolver.
export const CHAT_VERIFICATION_CEILING = 0.7;
export const SECURITY_RISKS = ["instruction_manipulation", "sensitive_exposure", "resource_abuse"] as const;

export function strongLayaReasons(scores: Assessment["scores"]) {
  return SECURITY_RISKS.filter((risk) => (scores[risk] ?? 1) >= CHAT_VERIFICATION_CEILING).map(
    (risk) => `semantic:${risk}`,
  );
}

export function verificationEnabled(policy: GatewayPolicy) {
  return policy.mode === "balanced" && policy.semantic.chat_verification === "qwen-context-v1";
}

/** null means a complete contextual verification is required before a decision. */
export function chatAssessmentGate(findings: Finding[], scores: Assessment["scores"], policy: GatewayPolicy) {
  const raw = decide(findings, scores, policy);
  if (!verificationEnabled(policy)) return raw;
  const deterministic = decide(findings, null, policy);
  if (deterministic.decision !== "ALLOW") return deterministic;
  const strong = strongLayaReasons(scores);
  if (strong.length) return { decision: "BLOCK" as const, reasons: strong };
  return raw.decision === "ALLOW" ? raw : null;
}

export function verifiedDecision(verdict: SecurityVerdict) {
  const risks = SECURITY_RISKS.filter((risk) => verdict[risk]);
  if (risks.length)
    return { decision: "BLOCK" as const, reasons: risks.map((risk) => `verification:${risk}`) };
  if (verdict.uncertain) return { decision: "REVIEW" as const, reasons: ["verification:uncertain"] };
  return { decision: "ALLOW" as const, reasons: [] };
}

export function verificationMessages(text: string, operation: "chat_input" | "chat_output"): ModelMessage[] {
  return [
    { role: "system", content: rubric.policy },
    { role: "user", content: JSON.stringify({ operation, audience: "actor", content: text }) },
  ];
}

export function parseSecurityVerdict(text: string): SecurityVerdict | null {
  try {
    // Duplicate keys have ambiguous meaning across JSON consumers; never accept last-key-wins.
    if (
      (text.match(/"(?:\\.|[^"\\])*"\s*:/g) ?? []).length !== 4 ||
      (text.match(/"(?:instruction_manipulation|sensitive_exposure|resource_abuse|uncertain)"\s*:/g) ?? [])
        .length !== 4
    )
      return null;
    const result = check("SecurityVerdict", JSON.parse(text));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}
