import { describe, expect, it } from "vitest";
import type { Review } from "@/shared/contracts";
import {
  MAX_CANDIDATE,
  MAX_REASON,
  draftFromReview,
  isResolvable,
  readReview,
  readReviewList,
  validateReview,
} from "./review";

/** The guards take the contract `data` union; these casts let the tests hand them junk. */
const parse = (value: unknown) => readReview(value as Parameters<typeof readReview>[0]);
const parseList = (value: unknown) => readReviewList(value as Parameters<typeof readReviewList>[0]);

const review: Review = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 3,
  candidate_text: "AsterCloud FY2025 revenue was 120.",
  classification: "internal",
  status: "pending",
  document_id: "22222222-2222-4222-8222-222222222222",
};

describe("readReview", () => {
  it("accepts a contract-shaped review", () => {
    expect(readReview(review)).toEqual(review);
  });

  it("rejects another operation's payload", () => {
    // The shapes that share the `data` union and would otherwise be rendered as a review.
    expect(parse({ id: "r", kind: "chat", state: "pending", stage: "queued" })).toBeNull();
    expect(
      readReview({ download_path: "/exports/1/download", expires_at: "2026-10-04T00:00:00Z" }),
    ).toBeNull();
    expect(parse({ answer: "text", citations: [] })).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it("rejects values outside the contract enums", () => {
    expect(parse({ ...review, classification: "secret" })).toBeNull();
    expect(parse({ ...review, status: "in_progress" })).toBeNull();
  });

  it("rejects a version that is not a positive integer", () => {
    expect(parse({ ...review, version: 0 })).toBeNull();
    expect(parse({ ...review, version: 1.5 })).toBeNull();
    expect(parse({ ...review, version: "3" })).toBeNull();
  });

  it("rejects empty candidate text rather than rendering a blank card", () => {
    expect(parse({ ...review, candidate_text: "" })).toBeNull();
  });
});

describe("readReviewList", () => {
  it("reads a page of reviews", () => {
    expect(readReviewList({ items: [review, { ...review, id: "other" }] })).toHaveLength(2);
  });

  it("returns an empty list for an empty page", () => {
    expect(readReviewList({ items: [] })).toEqual([]);
  });

  it("rejects the whole page when one entry is malformed", () => {
    expect(parseList({ items: [review, { ...review, status: "nonsense" }] })).toBeNull();
  });

  it("rejects a non-list payload", () => {
    expect(parseList(review)).toBeNull();
  });
});

describe("validateReview", () => {
  const draft = { candidateText: "Edited extract.", classification: "public" as const, reason: "Checked." };

  it("compares against the loaded version, never a guessed next one", () => {
    const result = validateReview(review, draft, "approve");
    expect(result.ok && result.body.expected_version).toBe(3);
  });

  it("builds the contract submission", () => {
    const result = validateReview(review, draft, "approve");
    expect(result.ok && result.body).toEqual({
      expected_version: 3,
      action: "approve",
      candidate_text: "Edited extract.",
      classification: "public",
      reason: "Checked.",
      evidence_excerpt_ids: [],
    });
  });

  it("carries the action through", () => {
    const result = validateReview(review, draft, "reject");
    expect(result.ok && result.body.action).toBe("reject");
  });

  it("trims before measuring, so whitespace is not a decision", () => {
    const result = validateReview(review, { ...draft, reason: "   Checked.   " }, "approve");
    expect(result.ok && result.body.reason).toBe("Checked.");
  });

  it("requires a reason, because a decision without one is not accountable", () => {
    const result = validateReview(review, { ...draft, reason: "  " }, "approve");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.reason).toMatch(/why/i);
  });

  it("requires candidate text", () => {
    const result = validateReview(review, { ...draft, candidateText: "" }, "approve");
    expect(!result.ok && result.errors.candidateText).toBeDefined();
  });

  it("enforces the contract maximums", () => {
    const long = validateReview(
      review,
      { ...draft, candidateText: "a".repeat(MAX_CANDIDATE + 1) },
      "approve",
    );
    expect(!long.ok && long.errors.candidateText).toContain(String(MAX_CANDIDATE));
    const reason = validateReview(review, { ...draft, reason: "b".repeat(MAX_REASON + 1) }, "approve");
    expect(!reason.ok && reason.errors.reason).toContain(String(MAX_REASON));
  });

  it("reports every problem at once rather than one per submission", () => {
    const result = validateReview(
      review,
      { candidateText: "", classification: "public", reason: "" },
      "approve",
    );
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(["candidateText", "reason"]);
  });
});

describe("draftFromReview", () => {
  it("starts from the stored candidate and a blank reason", () => {
    expect(draftFromReview(review)).toEqual({
      candidateText: review.candidate_text,
      classification: "internal",
      reason: "",
    });
  });
});

describe("isResolvable", () => {
  it("is true only while the review is pending", () => {
    expect(isResolvable(review)).toBe(true);
    for (const status of ["approved", "rejected", "expired"] as const) {
      expect(isResolvable({ ...review, status })).toBe(false);
    }
  });
});
