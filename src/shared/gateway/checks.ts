import "server-only";
import { createHash } from "node:crypto";
import type { Assessment, Decision, Finding, GatewayPolicy, ThreatFeed } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";

// Deterministic gateway checks (technical-spec §2/§3, semantic-protocol "Complete bounded coverage").

export const utf8Bytes = (s: string) => Buffer.byteLength(s, "utf8");
/** A string hashes as its UTF-8 bytes. */
export const sha256Hex = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
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

// ISO 13616: country code and check digits move to the end, letters become numbers (P=25, L=21), mod 97 == 1.
const plIbanValid = (m: string) => {
  const s = m.replace(/ /g, "");
  let r = 0;
  for (const c of s.slice(4) + "2521" + s.slice(2, 4)) r = (r * 10 + Number(c)) % 97;
  return r === 1;
};
// PESEL: weighted checksum plus a plausible birth date (month 01-12 shifted by 20s per century, day 01-31).
const peselValid = (m: string) => {
  const d = [...m].map(Number);
  const sum = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3].reduce((acc, w, i) => acc + w * d[i], 0);
  const month = Number(m.slice(2, 4)) % 20;
  const day = Number(m.slice(4, 6));
  return (10 - (sum % 10)) % 10 === d[10] && month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

// Conservative secret/contact patterns (technical-spec §3): illustrative coverage, not universal DLP.
// A token prefix must not continue a word, so "task-management" is not an `sk-` token.
// Number patterns need a +48 prefix or a valid checksum (PESEL also a valid date), so revenue figures,
// invoice numbers and UUID tails do not match. `valid` patterns are global and checked per match.
const SENSITIVE: { code: string; category: string; re: RegExp; valid?: (m: string) => boolean }[] = [
  { code: "PEM_KEY", category: "secret", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    code: "SECRET_TOKEN",
    category: "secret",
    re: /(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{8,}|sk_live_|ghp_|AKIA[0-9A-Z]{16}|sb_secret_|xox[abp]-)/,
  },
  // The local part starts at a boundary, so a long line without "@" is scanned once, not once per position.
  {
    code: "CONTACT_EMAIL",
    category: "personal",
    re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
  },
  { code: "CONTACT_PHONE", category: "personal", re: /(?<![\d+])\+48[ -]?\d{3}[ -]?\d{3}[ -]?\d{3}(?!\d)/ },
  {
    code: "BANK_ACCOUNT",
    category: "personal",
    re: /(?<![A-Za-z0-9])PL\d{2}(?: ?\d{4}){6}(?!\d)/g,
    valid: plIbanValid,
  },
  { code: "NATIONAL_ID", category: "personal", re: /(?<![\d-])\d{11}(?![\d-])/g, valid: peselValid },
];

/** Secret and contact findings with category and code only; the matched value never leaves. */
export function matchSensitive(text: string, stage: string): Finding[] {
  // Case is kept (AKIA is upper case); compatibility forms and zero-width characters cannot split a match.
  const t = text.normalize("NFKC").replace(/\p{Cf}/gu, "");
  const hit = ({ re, valid }: (typeof SENSITIVE)[number]) =>
    valid ? [...t.matchAll(re)].some((m) => valid(m[0])) : re.test(t);
  return SENSITIVE.filter(hit).map((p) => ({
    code: p.code,
    category: p.category,
    severity: "block",
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
