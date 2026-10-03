/*
 * W3 administrator review: reading a candidate safely, and submitting a decision at an exact version.
 *
 * Scope is deliberately the contract as it stands (B8, answered): `Review` carries candidate text,
 * classification, status, document id and version — nothing else. DESIGN also asks for the findings
 * and the original locator; that projection may arrive in T07. The screen leaves room for it and
 * invents no field, because a fabricated locator would be worse than an absent one.
 *
 * `evidence_excerpt_ids` is required by the contract and capped at 5, but no endpoint publishes the
 * excerpt ids an administrator could choose from, so it is submitted empty and the screen says so.
 */
import type { ApiResponse, Review, ReviewRequest } from "@/shared/contracts";

type Data = ApiResponse["data"];

const CLASSIFICATIONS = ["public", "internal", "restricted"] as const;
const STATUSES = ["pending", "approved", "rejected", "expired"] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];
export type ReviewStatus = (typeof STATUSES)[number];
export type ReviewAction = "approve" | "reject";

/** Contract limits: candidate_text 1–24000, reason 1–500, evidence_excerpt_ids max 5. */
export const MAX_CANDIDATE = 24000;
export const MAX_REASON = 500;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Narrow to a Review, checking the enums rather than only the keys.
 *
 * protocols.md: "Do not include the generic `data` union member for a different operation." A run,
 * an excerpt or an export path must not pass as a review.
 */
export function readReview(data: Data): Review | null {
  const o: unknown = data;
  if (!isRecord(o)) return null;
  const { id, version, candidate_text, classification, status, document_id } = o;
  if (typeof id !== "string" || id.length === 0) return null;
  if (!Number.isInteger(version) || (version as number) < 1) return null;
  if (typeof candidate_text !== "string" || candidate_text.length === 0) return null;
  if (typeof classification !== "string" || !(CLASSIFICATIONS as readonly string[]).includes(classification))
    return null;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) return null;
  if (typeof document_id !== "string" || document_id.length === 0) return null;
  return o as unknown as Review;
}

/** Narrow a review list. A single malformed entry rejects the whole page rather than hiding it. */
export function readReviewList(data: Data): Review[] | null {
  const o: unknown = data;
  if (!isRecord(o) || !Array.isArray(o.items)) return null;
  const items = o.items.map((item) => readReview(item as Data));
  return items.every((item): item is Review => item !== null) ? items : null;
}

export type ReviewDraft = {
  candidateText: string;
  classification: Classification;
  reason: string;
};

export const draftFromReview = (review: Review): ReviewDraft => ({
  candidateText: review.candidate_text,
  classification: review.classification,
  reason: "",
});

export type ReviewField = keyof ReviewDraft;

export type ReviewValidation =
  { ok: true; body: ReviewRequest } | { ok: false; errors: Partial<Record<ReviewField, string>> };

/**
 * Validate a decision and build its submission.
 *
 * `expected_version` is the version of the review as loaded: the gateway compares it against the
 * current head and rejects a stale edit with 409. The browser never guesses the next version.
 *
 * These messages are a courtesy, not a control. The gateway validates and decides.
 */
export function validateReview(review: Review, draft: ReviewDraft, action: ReviewAction): ReviewValidation {
  const errors: Partial<Record<ReviewField, string>> = {};
  const candidateText = draft.candidateText.trim();
  const reason = draft.reason.trim();

  if (candidateText.length === 0) errors.candidateText = "The candidate text cannot be empty.";
  else if (candidateText.length > MAX_CANDIDATE)
    errors.candidateText = `Shorten the candidate text to ${MAX_CANDIDATE} characters or fewer.`;

  if (!(CLASSIFICATIONS as readonly string[]).includes(draft.classification))
    errors.classification = "Choose a classification.";

  if (reason.length === 0) errors.reason = "Record why you are making this decision.";
  else if (reason.length > MAX_REASON)
    errors.reason = `Shorten the reason to ${MAX_REASON} characters or fewer.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      expected_version: review.version,
      action,
      candidate_text: candidateText,
      classification: draft.classification,
      reason,
      // No endpoint publishes selectable excerpt ids yet, so none are claimed.
      evidence_excerpt_ids: [],
    },
  };
}

/** Whether a decision may still be submitted. Presentation only: the gateway enforces it. */
export const isResolvable = (review: Review): boolean => review.status === "pending";

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending decision",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  public: "Public",
  internal: "Internal",
  restricted: "Restricted",
};
