/*
 * Citation display and validation.
 *
 * docs/product/technical-spec.md §6: "Resolve citation IDs only within permitted context; reject
 * invented IDs." The gateway is the authority — it validates citations before release. This module
 * is the second, local check so the screen cannot render a citation the answer did not come with,
 * and so a reviewer can see when something was rejected rather than silently dropped.
 */
import type { Citation } from "@/shared/contracts";

export type CitationView = {
  key: string;
  /** "Label — FY2025 (2026-03-15) · row 4 · v2" */
  display: string;
  excerptId: string;
  excerptVersion: number;
  sourceLabel: string;
  sourceDate: string;
  period: string;
  locator: string;
};

/** Stable identity of a cited excerpt version. Two versions of one excerpt are not interchangeable. */
const citationKey = (c: Citation) => `${c.excerpt_id}@${c.excerpt_version}`;

export function formatCitation(c: Citation): string {
  return `${c.source_label} — ${c.period} (${c.source_date}) · ${c.locator} · v${c.excerpt_version}`;
}

export function toCitationView(c: Citation): CitationView {
  return {
    key: citationKey(c),
    display: formatCitation(c),
    excerptId: c.excerpt_id,
    excerptVersion: c.excerpt_version,
    sourceLabel: c.source_label,
    sourceDate: c.source_date,
    period: c.period,
    locator: c.locator,
  };
}

export type CitationCheck = {
  accepted: CitationView[];
  /** Citations whose excerpt is outside the permitted set, or that are malformed. */
  rejected: CitationView[];
  /** True when anything was rejected: the screen must say so rather than quietly show fewer. */
  hasRejected: boolean;
};

const isWellFormed = (c: Citation): boolean =>
  typeof c.excerpt_id === "string" &&
  c.excerpt_id.length > 0 &&
  Number.isInteger(c.excerpt_version) &&
  c.excerpt_version >= 1 &&
  typeof c.source_label === "string" &&
  c.source_label.length > 0 &&
  typeof c.locator === "string" &&
  c.locator.length > 0;

/**
 * Keep only citations whose excerpt ID is in the permitted set, de-duplicated by excerpt version.
 *
 * `permittedExcerptIds` must come from the same authorized response as the citations. Passing
 * `null` means "the response carried no permitted set", which is treated as permitting nothing —
 * failing closed rather than trusting the model's list.
 */
export function checkCitations(
  citations: readonly Citation[],
  permittedExcerptIds: readonly string[] | null,
): CitationCheck {
  const permitted = new Set(permittedExcerptIds ?? []);
  const accepted: CitationView[] = [];
  const rejected: CitationView[] = [];
  const seen = new Set<string>();

  for (const c of citations) {
    const view = toCitationView(c);
    if (seen.has(view.key)) continue;
    seen.add(view.key);
    if (isWellFormed(c) && permitted.has(c.excerpt_id)) accepted.push(view);
    else rejected.push(view);
  }

  return { accepted, rejected, hasRejected: rejected.length > 0 };
}
