/*
 * Threat-feed administration form.
 *
 * Rules from docs/contracts/threat-feed.schema.json plus the business rules in
 * docs/product/technical-spec.md §5: unique indicator IDs, `published_at <= now`,
 * `expires_at > now`, non-empty values and domain syntax.
 *
 * As with the policy form, this is a first check in the browser. The gateway validates and decides,
 * and an indicator only has effect once the gateway installs the version.
 */
import type { ThreatFeed } from "@/shared/contracts";

export const FEED_KINDS = ["literal", "domain"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const FEED_CATEGORIES = ["prompt_injection", "exfiltration", "unsafe_code", "resource_abuse"] as const;
export type FeedCategory = (typeof FEED_CATEGORIES)[number];

export const FEED_ACTIONS = ["REVIEW", "BLOCK"] as const;
export type FeedAction = (typeof FEED_ACTIONS)[number];

export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  prompt_injection: "Prompt injection",
  exfiltration: "Exfiltration",
  unsafe_code: "Unsafe code",
  resource_abuse: "Resource abuse",
};

/** Schema ceilings. A feed may carry fewer, never more. */
export const MAX_INDICATORS = 100;
const LIMITS = { source: 120, id: 80, value: 256, description: 300 } as const;

export type IndicatorDraft = {
  id: string;
  kind: string;
  value: string;
  category: string;
  action: string;
  description: string;
};

export type FeedDraft = {
  source: string;
  publishedAt: string;
  expiresAt: string;
  indicators: IndicatorDraft[];
};

export const EMPTY_INDICATOR: IndicatorDraft = {
  id: "",
  kind: "literal",
  value: "",
  category: "prompt_injection",
  action: "BLOCK",
  description: "",
};

export const emptyFeedDraft = (): FeedDraft => ({
  source: "",
  publishedAt: "",
  expiresAt: "",
  indicators: [{ ...EMPTY_INDICATOR }],
});

/**
 * Dot-boundary domain syntax. Matching is literal after normalisation, and the gateway never
 * fetches a link — this only rejects input that could not be a hostname.
 */
const DOMAIN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const isDomainValue = (value: string): boolean => DOMAIN.test(value.trim().toLowerCase());

export type IndicatorErrors = Partial<Record<keyof IndicatorDraft, string>>;

export type FeedValidation =
  | { ok: true; feed: ThreatFeed }
  | {
      ok: false;
      errors: Partial<Record<"source" | "publishedAt" | "expiresAt" | "indicators", string>>;
      indicatorErrors: Record<number, IndicatorErrors>;
    };

/*
 * A `datetime-local` control yields "2026-10-03T15:00" with no zone, which Date.parse reads as the
 * viewer's local time — so the same keystrokes mean different instants in different zones. That is
 * accepted (it is what the control means) but it must never be hidden: `resolveInstant` exposes the
 * UTC instant the form will actually submit, and the panel displays it beside the field, which is
 * also what DESIGN's "UTC timestamps labelled" requires.
 */
const parsed = (value: string): number | null => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
};

/** The UTC instant a form value resolves to, or null when it is not a time at all. */
export function resolveInstant(value: string): string | null {
  const t = parsed(value);
  return t === null ? null : new Date(t).toISOString();
}

/**
 * Validate a draft and build the feed document.
 *
 * `version` is the submitted document's own version, which must be the head plus one.
 */
export function validateFeedDraft(
  draft: FeedDraft,
  options: { version: number; now?: Date },
): FeedValidation {
  const now = (options.now ?? new Date()).getTime();
  const errors: Partial<Record<"source" | "publishedAt" | "expiresAt" | "indicators", string>> = {};
  const indicatorErrors: Record<number, IndicatorErrors> = {};

  const source = draft.source.trim();
  if (source.length === 0) errors.source = "Name the feed source.";
  else if (source.length > LIMITS.source) {
    errors.source = `Keep the source to ${LIMITS.source} characters or fewer.`;
  }

  const published = parsed(draft.publishedAt);
  if (published === null) errors.publishedAt = "Give a valid publication time.";
  else if (published > now) errors.publishedAt = "The publication time cannot be in the future.";

  const expires = parsed(draft.expiresAt);
  if (expires === null) errors.expiresAt = "Give a valid expiry time.";
  else if (expires <= now) errors.expiresAt = "The expiry must be in the future.";

  if (draft.indicators.length === 0) errors.indicators = "Add at least one indicator.";
  else if (draft.indicators.length > MAX_INDICATORS) {
    errors.indicators = `A feed carries at most ${MAX_INDICATORS} indicators.`;
  }

  const seen = new Map<string, number>();
  draft.indicators.forEach((indicator, index) => {
    const row: IndicatorErrors = {};
    const id = indicator.id.trim();
    const value = indicator.value.trim();
    const description = indicator.description.trim();

    if (id.length === 0) row.id = "Give the indicator an id.";
    else if (id.length > LIMITS.id) row.id = `Keep the id to ${LIMITS.id} characters or fewer.`;
    else if (seen.has(id)) row.id = `Duplicate id; it is already used by indicator ${seen.get(id)! + 1}.`;
    else seen.set(id, index);

    if (!(FEED_KINDS as readonly string[]).includes(indicator.kind)) row.kind = "Choose a kind.";
    if (!(FEED_CATEGORIES as readonly string[]).includes(indicator.category)) {
      row.category = "Choose a category.";
    }
    if (!(FEED_ACTIONS as readonly string[]).includes(indicator.action)) {
      row.action = "Choose an action.";
    }

    if (value.length === 0) row.value = "Give the value to match.";
    else if (value.length > LIMITS.value) {
      row.value = `Keep the value to ${LIMITS.value} characters or fewer.`;
    } else if (indicator.kind === "domain" && !isDomainValue(value)) {
      row.value = "A domain indicator needs valid hostname syntax.";
    }

    if (description.length === 0) row.description = "Describe what this indicator catches.";
    else if (description.length > LIMITS.description) {
      row.description = `Keep the description to ${LIMITS.description} characters or fewer.`;
    }

    if (Object.keys(row).length > 0) indicatorErrors[index] = row;
  });

  if (Object.keys(errors).length > 0 || Object.keys(indicatorErrors).length > 0) {
    return { ok: false, errors, indicatorErrors };
  }

  return {
    ok: true,
    feed: {
      schema_version: 1,
      version: options.version,
      source,
      published_at: new Date(published!).toISOString(),
      expires_at: new Date(expires!).toISOString(),
      indicators: draft.indicators.map((i) => ({
        id: i.id.trim(),
        kind: i.kind as FeedKind,
        value: i.value.trim(),
        category: i.category as FeedCategory,
        action: i.action as FeedAction,
        description: i.description.trim(),
      })),
    } as ThreatFeed,
  };
}

/**
 * Feed compare-and-swap. `feed_import` allows `expected_version` of 0, which is the case where no
 * feed is installed yet; the submitted document's own version is then 1.
 */
export function feedSubmissionVersions(headVersion: number | null): {
  expected_version: number;
  version: number;
} {
  const head = headVersion ?? 0;
  return { expected_version: head, version: head + 1 };
}

/** Seed an edit from the installed feed, so an administrator extends rather than retypes. */
export function draftFromFeed(feed: ThreatFeed): FeedDraft {
  return {
    source: feed.source,
    publishedAt: feed.published_at.slice(0, 16),
    expiresAt: feed.expires_at.slice(0, 16),
    indicators: feed.indicators.map((i) => ({
      id: i.id,
      kind: i.kind,
      value: i.value,
      category: i.category,
      action: i.action,
      description: i.description,
    })),
  };
}
