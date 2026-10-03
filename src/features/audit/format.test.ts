import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDuration,
  formatElapsed,
  formatHash,
  formatRatio,
  formatRevision,
  formatScore,
  formatTimestampUtc,
  formatTokens,
  group,
  isUuid,
  shortId,
} from "./format";

describe("number formatting", () => {
  it("groups thousands in English style, independently of the host locale", () => {
    expect(group(0)).toBe("0");
    expect(group(999)).toBe("999");
    expect(group(1842)).toBe("1,842");
    expect(group(3342)).toBe("3,342");
    expect(group(1234567)).toBe("1,234,567");
    expect(group(-4096)).toBe("-4,096");
  });

  it("never renders an unknown count as zero", () => {
    expect(formatTokens(null)).toBe("Not measured");
    expect(formatCount(null)).toBe("Not measured");
    expect(formatTokens(0)).toBe("0 tokens");
    expect(formatTokens(3342)).toBe("3,342 tokens");
  });

  it("switches from milliseconds to seconds at one second", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(1000)).toBe("1.0 s");
    expect(formatDuration(7120)).toBe("7.1 s");
    expect(formatDuration(null)).toBe("Not measured");
  });

  it("keeps scores at two decimals and distinguishes unmeasured from low", () => {
    expect(formatScore(0)).toBe("0.00");
    expect(formatScore(0.4)).toBe("0.40");
    expect(formatScore(1)).toBe("1.00");
    expect(formatScore(null)).toBe("Not measured");
  });

  it("renders window coverage as completed over planned", () => {
    expect(formatRatio(2, 3)).toBe("2 / 3");
    expect(formatRatio(0, 0)).toBe("0 / 0");
  });
});

describe("timestamps", () => {
  it("states the zone explicitly and uses UTC components", () => {
    expect(formatTimestampUtc("2026-10-03T09:41:07.000Z")).toBe("2026-10-03 09:41:07 UTC");
    expect(formatTimestampUtc("2026-01-02T00:00:00Z")).toBe("2026-01-02 00:00:00 UTC");
  });

  it("does not invent a time for an unparseable value", () => {
    expect(formatTimestampUtc("not a date")).toBe("Unknown");
  });

  it("reports elapsed time between stages, and nothing when the order is impossible", () => {
    expect(formatElapsed("2026-10-03T09:41:07Z", "2026-10-03T09:41:07.812Z")).toBe("+812 ms");
    expect(formatElapsed("2026-10-03T09:41:07Z", "2026-10-03T09:41:14.120Z")).toBe("+7.1 s");
    expect(formatElapsed("2026-10-03T09:41:14Z", "2026-10-03T09:41:07Z")).toBeNull();
    expect(formatElapsed("broken", "2026-10-03T09:41:07Z")).toBeNull();
  });
});

describe("identifiers and integrity values", () => {
  it("shortens a uuid but keeps both ends", () => {
    expect(shortId("3f6c1d2e-9b47-4c81-a0f5-7d2e5b914c33")).toBe("3f6c1d2e…4c33");
    expect(shortId("short")).toBe("short");
  });

  it("marks a missing hash or revision instead of leaving an empty cell", () => {
    expect(formatHash(null)).toBe("No hash recorded");
    expect(formatHash("9f2c4a1b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928170605f4e3")).toBe(
      "9f2c4a1b8e7d…",
    );
    expect(formatRevision(null)).toBe("Revision not reported");
    expect(formatRevision("typed-decisions@3")).toBe("typed-decisions@3");
  });

  it("accepts only a well-formed uuid, so a malformed id is answered without a request", () => {
    expect(isUuid("3f6c1d2e-9b47-4c81-a0f5-7d2e5b914c33")).toBe(true);
    expect(isUuid("3F6C1D2E-9B47-4C81-A0F5-7D2E5B914C33")).toBe(true);
    expect(isUuid("3f6c1d2e9b474c81a0f57d2e5b914c33")).toBe(false);
    expect(isUuid("../../etc/passwd")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
