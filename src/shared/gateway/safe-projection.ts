import "server-only";
import type { ThreatFeed } from "@/shared/contracts";
import { matchSensitive, matchSignatures } from "./checks";
import type { PermittedExcerpt } from "./ports";

// Raw originals and candidate excerpts remain private. Only this per-request projection may be
// supplied to generation or an ordinary content response. Patterns are deliberately bounded;
// unrecognised or instruction-shaped candidate segments are withheld, not guessed into facts.
const PRIVATE_SPANS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|sb_secret_[A-Za-z0-9_-]+|xox[abp]-[A-Za-z0-9_-]+)/g,
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
  /(?<!\d)(?:\+?\d[\d ().-]{7,}\d)(?!\d)/g,
];
const PRIVATE_CONTEXT =
  /\b(?:personal contact|private address|credential|password|api key|access token|secret key|private key|phone number)\b/i;
const INSTRUCTION =
  /\b(?:ignore (?:all |any |the )?(?:previous|prior|above|system|developer) instructions|(?:send|transmit|exfiltrate|reveal|print|output) (?:the |all |any )?(?:secret|credential|password|private|system prompt)|(?:override|bypass|disable) (?:the |all )?(?:rules|policy|guardrails|security)|you are now|act as (?:the |a )?(?:system|developer)|system prompt|developer message)\b|<\|(?:system|developer)\|>|\[(?:system|developer)\]/i;
const FACT_SHAPE = /\b(?:is|was|are|were|will|reported|lists|forecast|ceiling|pipeline|revenue|webinar)\b/i;
const OPAQUE_OR_COMMAND =
  /(?:[A-Za-z0-9+/]{24,}={0,2}|https?:\/\/|www\.|-----BEGIN |-----END |^\s*(?:send|transmit|exfiltrate|reveal|print|output|repeat|run|execute|ignore|disregard|override|bypass)\b)/i;

/** Does not persist or mutate the original. Null means no safely servable fact remains. */
export function projectServedExcerpt(row: PermittedExcerpt, feed: ThreatFeed): PermittedExcerpt | null {
  let text = row.text.normalize("NFKC").replace(/\p{Cf}/gu, "");
  for (const re of PRIVATE_SPANS) text = text.replace(re, "[redacted]");
  // Split independent clauses before filtering so a credential in the next clause does not
  // erase an otherwise safe fact from the same imported row.
  const parts = text.split(
    /\n+|\s*;\s*|(?<=[.!?])\s+(?=[A-Z])|\s+and\s+(?=(?:my |the )?(?:credential|password|api key|access token|secret key|private key|personal contact|phone number)\b)/iu,
  );
  const safe = parts
    .map((part) => part.trim())
    .filter((part) => {
      if (
        !part ||
        part.includes("[redacted]") ||
        PRIVATE_CONTEXT.test(part) ||
        INSTRUCTION.test(part) ||
        OPAQUE_OR_COMMAND.test(part)
      )
        return false;
      if (matchSensitive(part, "projection").length || matchSignatures(part, feed, "projection").length)
        return false;
      return (
        row.status !== "candidate" ||
        (FACT_SHAPE.test(part) && (part.match(/[A-Za-z]{2,}/g)?.length ?? 0) >= 3)
      );
    });
  const projected = safe.join(" ").slice(0, 1600).trim();
  if (!projected || matchSensitive(projected, "projection").length) return null;
  const sourceLabel = projectSourceLabel(row.source_label, 120);
  const locator = projectSourceLabel(row.locator, 80);
  const period = projectSourceLabel(row.period, 50);
  const unit = projectSourceLabel(row.unit, 60);
  const factKey = row.fact_key === null ? null : projectSourceLabel(row.fact_key, 60);
  if (!sourceLabel || !locator || !period || !unit || (row.fact_key !== null && !factKey)) return null;
  return { ...row, text: projected, source_label: sourceLabel, locator, period, unit, fact_key: factKey };
}

export function projectServedExcerpts(rows: readonly PermittedExcerpt[], feed: ThreatFeed) {
  return rows.flatMap((row) => {
    const projected = projectServedExcerpt(row, feed);
    return projected ? [projected] : [];
  });
}

/** Metadata is untrusted too: a filename must not become a secret or an instruction in a response. */
export function projectSourceLabel(label: string, max = 200): string | null {
  let safe = label
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const re of PRIVATE_SPANS) safe = safe.replace(re, "[redacted]");
  return safe &&
    !PRIVATE_CONTEXT.test(safe) &&
    !INSTRUCTION.test(safe) &&
    !OPAQUE_OR_COMMAND.test(safe) &&
    !matchSensitive(safe, "projection").length
    ? safe.slice(0, max)
    : null;
}
