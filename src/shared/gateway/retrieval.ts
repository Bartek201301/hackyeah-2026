import "server-only";
import type { Citation } from "@/shared/contracts";
import { utf8Bytes } from "./checks";
import type { PermittedExcerpt } from "./ports";

// Gateway retrieval for chat (post-G2 decision 1): permitted excerpts become tagged sources [S1]..[Sn],
// the model cites the tags, and the gateway validates and rewrites them to [1]..[k] before any check.

const system = (prompt: string, lines: string[]) =>
  `${prompt}\n\nSources:\n${lines.length ? lines.join("\n") : "(none)"}`;

/**
 * The system message with excerpts in rank order while system + message fit `maxBytes`; the rest is
 * dropped, so tags stay contiguous. `excerpts` is what the model was given.
 * ponytail: conflict grouping (technical-spec §6) is deferred; the 7-row demo corpus fits whole.
 */
export function buildContext(
  excerpts: readonly PermittedExcerpt[],
  prompt: string,
  message: string,
  maxBytes: number,
) {
  const lines: string[] = [];
  for (const e of excerpts) {
    // One line per source: a newline inside excerpt text cannot forge another [S<n>] line.
    const meta = [e.source_label, e.source_date, e.period, e.unit, e.basis].join(" | ");
    const line = `[S${lines.length + 1}] ${meta}: ${e.text}`.replace(/\s+/g, " ");
    if (utf8Bytes(system(prompt, [...lines, line])) + utf8Bytes(message) > maxBytes) break;
    lines.push(line);
  }
  return { system: system(prompt, lines), excerpts: excerpts.slice(0, lines.length) };
}

// One bracket holds one or more tags: [S1] or [S1, S3].
const TAG_GROUP = /\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/gi;
const tagsOf = (group: string) => [...group.matchAll(/S(\d+)/gi)].map((m) => Number(m[1]));

/** Distinct tags in first-appearance order; `unknown` = a tag outside 1..n (an invented source). */
export function parseCitations(text: string, n: number) {
  const all = [...text.matchAll(TAG_GROUP)].flatMap((m) => tagsOf(m[0]));
  return {
    tags: [...new Set(all)].filter((t) => t >= 1 && t <= n),
    unknown: all.some((t) => !(t >= 1 && t <= n)),
  };
}

/** [S<tag>] → [<position in tags>]; a group becomes adjacent markers, e.g. [S3, S1] → [1][2]. */
export function rewriteCitations(text: string, tags: readonly number[]) {
  return text.replace(TAG_GROUP, (group) =>
    tagsOf(group)
      .map((t) => `[${tags.indexOf(t) + 1}]`)
      .join(""),
  );
}

// ponytail: amounts and percentages only; T11 widens it (bare figures, dates as facts).
const NUMERIC_CLAIM = /\b\d[\d.,]*\s*(?:(?:million|billion|thousand|percent)\b|%)|\bUSD\s*\d/i;
export const hasNumericClaim = (text: string) => NUMERIC_CLAIM.test(text);

export const toCitation = (e: PermittedExcerpt): Citation => ({
  excerpt_id: e.id,
  excerpt_version: e.version,
  source_label: e.source_label,
  source_date: e.source_date,
  period: e.period,
  locator: e.locator,
});
