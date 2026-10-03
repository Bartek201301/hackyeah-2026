import "server-only";
import { createHash } from "node:crypto";
import type { Assessment, Decision, Finding, GatewayPolicy, ThreatFeed } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";

// Deterministic gateway checks (technical-spec §2/§3, semantic-protocol "Complete bounded coverage").

export const utf8Bytes = (s: string) => Buffer.byteLength(s, "utf8");
export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** UTC date at the moment of the call: budget buckets reconcile to this original day. */
export const utcDay = (at = new Date()) => at.toISOString().slice(0, 10);

const RISKS = ["instruction_manipulation", "sensitive_exposure", "resource_abuse"] as const;
// Format characters (zero-width) are dropped and whitespace runs collapse, so spacing cannot evade a literal.
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ");
const HOSTNAME = /[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/g;

/** Bounded literal substrings and dot-boundary hostnames. No fetching, no feed regex, no matched value out. */
export function matchSignatures(text: string, feed: ThreatFeed, stage: string): Finding[] {
  const t = normalize(text);
  const hosts = t.match(HOSTNAME) ?? [];
  return feed.indicators
    .filter((i) => {
      const v = normalize(i.value);
      if (!v) return false;
      return i.kind === "literal" ? t.includes(v) : hosts.some((h) => h === v || h.endsWith("." + v));
    })
    .map((i) => ({
      code: i.id,
      category: i.category,
      severity: i.action === "BLOCK" ? "block" : "review",
      stage,
      locator: null,
    }));
}

/** The engine checks returned coverage itself instead of trusting `coverage_complete` alone. */
export function verifyCoverage(
  text: string,
  a: Assessment,
  policy: GatewayPolicy,
  expectedRevision: string | null,
): boolean {
  if (!check("Assessment", a).ok) return false;
  const { max_windows, context_tokens } = policy.semantic;
  const ranges = a.coverage_ranges;
  const length = [...text].length;
  if (a.status !== "complete" || a.coverage_complete !== true) return false;
  if (!a.checkpoint_revision || (expectedRevision && a.checkpoint_revision !== expectedRevision))
    return false;
  if (a.text_sha256 !== sha256Hex(text)) return false;
  if (a.windows_planned < 1 || a.windows_planned > max_windows) return false;
  if (a.windows_completed !== a.windows_planned || ranges.length !== a.windows_planned) return false;
  let covered = 0;
  for (const [i, r] of ranges.entries()) {
    if (r.start_char >= r.end_char || r.end_char > length) return false;
    if (i === 0 ? r.start_char !== 0 : r.start_char < ranges[i - 1].start_char || r.start_char > covered)
      return false;
    if (!(r.input_tokens > 0 && r.input_tokens <= context_tokens)) return false;
    covered = Math.max(covered, r.end_char);
  }
  if (covered !== length || ranges[ranges.length - 1].end_char !== length) return false;
  return RISKS.every((k) => {
    const s = a.scores[k];
    return typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= 1;
  });
}

/** Precedence: block finding/score → BLOCK; review band → REVIEW (BLOCK in strict mode); else ALLOW. */
export function decide(
  findings: readonly Finding[],
  scores: Assessment["scores"] | null,
  policy: GatewayPolicy,
): { decision: Extract<Decision, "ALLOW" | "REVIEW" | "BLOCK">; reasons: string[] } {
  const { thresholds } = policy.semantic;
  const tier = (band: "block" | "review") => [
    ...findings.filter((f) => f.severity === band).map((f) => `${f.stage}:${f.code}`),
    ...RISKS.filter((k) => (scores?.[k] ?? -1) >= thresholds[k][band]).map((k) => `semantic:${k}`),
  ];
  const reasons = (list: string[]) => [...new Set(list.map((r) => r.slice(0, 80)))].slice(0, 20);
  const block = tier("block");
  if (block.length) return { decision: "BLOCK", reasons: reasons(block) };
  const review = tier("review");
  if (review.length)
    return { decision: policy.mode === "strict" ? "BLOCK" : "REVIEW", reasons: reasons(review) };
  return { decision: "ALLOW", reasons: [] };
}
