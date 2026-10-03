import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "@/shared/contracts/validate";
import type { ThreatFeed } from "@/shared/contracts";
import {
  EMPTY_INDICATOR,
  resolveInstant,
  MAX_INDICATORS,
  draftFromFeed,
  emptyFeedDraft,
  feedSubmissionVersions,
  isDomainValue,
  validateFeedDraft,
  type FeedDraft,
} from "./feedForm";

const NOW = new Date("2026-10-03T16:00:00Z");

const indicator = (over: Partial<FeedDraft["indicators"][number]> = {}) => ({
  ...EMPTY_INDICATOR,
  id: "IND-1",
  value: "transmit the confidential archive",
  description: "Known exfiltration instruction.",
  ...over,
});

/* Explicit Z so these assertions do not depend on the runner's timezone. The bare `datetime-local`
 * form of the same value is covered separately below. */
const draft = (over: Partial<FeedDraft> = {}): FeedDraft => ({
  source: "Demo threat desk",
  publishedAt: "2026-10-03T15:00:00Z",
  expiresAt: "2026-10-04T15:00:00Z",
  indicators: [indicator()],
  ...over,
});

const validate = (d: FeedDraft) => validateFeedDraft(d, { version: 1, now: NOW });

describe("validateFeedDraft", () => {
  it("builds a document that satisfies the published feed schema", () => {
    const out = validate(draft());
    expect(out.ok).toBe(true);
    if (out.ok) expect(check("ThreatFeed", out.feed)).toEqual({ ok: true, value: out.feed });
  });

  it("normalises timestamps to ISO and trims text", () => {
    const out = validate(draft({ source: "  Demo threat desk  " }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.feed.source).toBe("Demo threat desk");
      expect(out.feed.published_at).toMatch(/Z$/);
      expect(out.feed.expires_at).toMatch(/Z$/);
    }
  });

  it("rejects a publication time in the future", () => {
    const out = validate(draft({ publishedAt: "2026-10-03T17:00:00Z" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.publishedAt).toMatch(/cannot be in the future/i);
  });

  it("requires the expiry to be in the future", () => {
    for (const expiresAt of ["2026-10-03T16:00:00Z", "2026-10-03T15:00:00Z"]) {
      const out = validate(draft({ expiresAt }));
      expect(out.ok, expiresAt).toBe(false);
      if (!out.ok) expect(out.errors.expiresAt).toMatch(/must be in the future/i);
    }
  });

  it("rejects unparseable timestamps", () => {
    const out = validate(draft({ publishedAt: "soon", expiresAt: "" }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.publishedAt).toBeTruthy();
      expect(out.errors.expiresAt).toBeTruthy();
    }
  });

  it("requires a source", () => {
    expect(validate(draft({ source: "   " })).ok).toBe(false);
  });

  it("requires at least one indicator and caps the list", () => {
    expect(validate(draft({ indicators: [] })).ok).toBe(false);

    const many = Array.from({ length: MAX_INDICATORS + 1 }, (_, i) => indicator({ id: `IND-${i}` }));
    const out = validate(draft({ indicators: many }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.indicators).toMatch(/at most 100/i);
  });

  it("rejects duplicate indicator ids and names the earlier row", () => {
    const out = validate(draft({ indicators: [indicator(), indicator()] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.indicatorErrors[1]?.id).toMatch(/duplicate id.*indicator 1/i);
  });

  it("requires every indicator field", () => {
    for (const field of ["id", "value", "description"] as const) {
      const out = validate(draft({ indicators: [indicator({ [field]: "  " })] }));
      expect(out.ok, field).toBe(false);
      if (!out.ok) expect(out.indicatorErrors[0]?.[field]).toBeTruthy();
    }
  });

  it("rejects values outside the enums", () => {
    for (const [field, bad] of [
      ["kind", "regex"],
      ["category", "spam"],
      ["action", "ALLOW"],
    ] as const) {
      const out = validate(draft({ indicators: [indicator({ [field]: bad })] }));
      expect(out.ok, field).toBe(false);
    }
  });

  it("does not let a feed introduce an ALLOW action", () => {
    const out = validate(draft({ indicators: [indicator({ action: "ALLOW" })] }));
    expect(out.ok).toBe(false);
  });

  it("checks domain syntax only for a domain indicator", () => {
    const ok = validate(
      draft({ indicators: [indicator({ kind: "domain", value: "exfil.example.invalid" })] }),
    );
    expect(ok.ok).toBe(true);

    for (const bad of ["not a domain", "-bad.example", "nodot", "http://example.invalid"]) {
      const out = validate(draft({ indicators: [indicator({ kind: "domain", value: bad })] }));
      expect(out.ok, bad).toBe(false);
    }

    // The same string is fine as a literal, which is matched verbatim after normalisation.
    expect(validate(draft({ indicators: [indicator({ kind: "literal", value: "not a domain" })] })).ok).toBe(
      true,
    );
  });

  it("reports feed-level and indicator-level problems together", () => {
    const out = validate(draft({ source: "", indicators: [indicator({ id: "" })] }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.source).toBeTruthy();
      expect(out.indicatorErrors[0]?.id).toBeTruthy();
    }
  });
});

describe("resolveInstant", () => {
  it("shows the UTC instant an explicit value resolves to", () => {
    expect(resolveInstant("2026-10-03T15:00:00Z")).toBe("2026-10-03T15:00:00.000Z");
  });

  it("resolves a zone-less datetime-local value through the local zone", () => {
    // Deliberate: that is what the control means. The panel renders this string so the
    // administrator sees the instant being submitted rather than guessing at it.
    const resolved = resolveInstant("2026-10-03T15:00");
    expect(resolved).toMatch(/^2026-10-0[23]T\d\d:00:00\.000Z$/);
  });

  it("returns null for a non-time", () => {
    expect(resolveInstant("soon")).toBeNull();
    expect(resolveInstant("")).toBeNull();
  });
});

describe("isDomainValue", () => {
  it("accepts dotted hostnames and ignores case and padding", () => {
    expect(isDomainValue("Exfil.Example.Invalid")).toBe(true);
    expect(isDomainValue("  a.b  ")).toBe(true);
  });

  it("rejects a single label and malformed labels", () => {
    for (const v of ["localhost", "a..b", "a-.b", ".b", "a.b-"]) {
      expect(isDomainValue(v), v).toBe(false);
    }
  });
});

describe("feedSubmissionVersions", () => {
  it("uses 0 as the expected head when no feed is installed", () => {
    expect(feedSubmissionVersions(null)).toEqual({ expected_version: 0, version: 1 });
  });

  it("compares against the installed head and submits the next version", () => {
    expect(feedSubmissionVersions(3)).toEqual({ expected_version: 3, version: 4 });
  });
});

describe("draftFromFeed", () => {
  it("round-trips the shipped example through the form", () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("../../../../docs/contracts/threat-feed.example.json", import.meta.url), "utf8"),
    );
    const parsedFeed = check("ThreatFeed", raw);
    expect(parsedFeed.ok).toBe(true);
    if (!parsedFeed.ok) return;

    const feed = parsedFeed.value as ThreatFeed;
    const d = draftFromFeed(feed);
    expect(d.source).toBe(feed.source);
    expect(d.indicators).toHaveLength(feed.indicators.length);

    // Re-validating against a future expiry rebuilds an equivalent document.
    const out = validateFeedDraft(
      { ...d, expiresAt: "2099-01-01T00:00:00Z" },
      { version: feed.version, now: NOW },
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.feed.indicators).toEqual(feed.indicators);
  });
});

describe("emptyFeedDraft", () => {
  it("starts with one blank indicator that does not yet validate", () => {
    const d = emptyFeedDraft();
    expect(d.indicators).toHaveLength(1);
    expect(validate(d).ok).toBe(false);
  });
});
