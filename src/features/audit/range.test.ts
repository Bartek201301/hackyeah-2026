import { describe, expect, it } from "vitest";
import { dayBounds, isSingleUtcDay, isUtcDay, parseDay, shiftDay, todayUtc } from "./range";

const now = new Date("2026-10-03T14:22:51.000Z");

describe("parsing a day", () => {
  it("accepts a day that exists", () => {
    expect(isUtcDay("2026-10-03")).toBe(true);
    expect(isUtcDay("2026-02-28")).toBe(true);
    expect(isUtcDay("2028-02-29")).toBe(true);
  });

  it("rejects a day that does not exist instead of shifting it", () => {
    expect(isUtcDay("2026-02-30")).toBe(false);
    expect(isUtcDay("2026-13-01")).toBe(false);
    expect(isUtcDay("2026-00-10")).toBe(false);
    expect(isUtcDay("2027-02-29")).toBe(false);
  });

  it("rejects anything that is not a bare UTC day", () => {
    expect(isUtcDay("2026-10-03T00:00:00Z")).toBe(false);
    expect(isUtcDay("03-10-2026")).toBe(false);
    expect(isUtcDay("2026-10-3")).toBe(false);
    expect(isUtcDay("")).toBe(false);
    expect(isUtcDay(undefined)).toBe(false);
    expect(isUtcDay(["2026-10-03"])).toBe(false);
  });

  it("falls back to the current UTC day, never to a wider window", () => {
    expect(parseDay(undefined, now)).toBe("2026-10-03");
    expect(parseDay("yesterday", now)).toBe("2026-10-03");
    expect(parseDay("2026-02-30", now)).toBe("2026-10-03");
    expect(parseDay(["2026-09-01", "2026-09-02"], now)).toBe("2026-10-03");
    expect(parseDay("2026-09-01", now)).toBe("2026-09-01");
  });

  it("reads the current day in UTC, not in the host timezone", () => {
    expect(todayUtc(new Date("2026-10-03T23:59:59.999Z"))).toBe("2026-10-03");
    expect(todayUtc(new Date("2026-10-04T00:00:00.000Z"))).toBe("2026-10-04");
  });
});

describe("the bounds sent to the gateway", () => {
  it("covers exactly one UTC day, inclusive", () => {
    expect(dayBounds("2026-10-03")).toEqual({
      from: "2026-10-03T00:00:00.000Z",
      to: "2026-10-03T23:59:59.999Z",
    });
  });

  it("stays inside one day for every day it produces", () => {
    for (const day of ["2026-01-01", "2026-02-28", "2026-12-31", "2028-02-29"]) {
      const { from, to } = dayBounds(day);
      expect(isSingleUtcDay(from, to), day).toBe(true);
    }
  });
});

describe("moving between days", () => {
  it("crosses month and year boundaries correctly", () => {
    expect(shiftDay("2026-10-03", -1)).toBe("2026-10-02");
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("guarding the window a response reports", () => {
  it("accepts a single day and refuses a wider or inverted one", () => {
    expect(isSingleUtcDay("2026-10-03T00:00:00Z", "2026-10-03T23:59:59.999Z")).toBe(true);
    expect(isSingleUtcDay("2026-10-03T00:00:00Z", "2026-10-04T00:00:00Z")).toBe(false);
    expect(isSingleUtcDay("2026-10-03T12:00:00Z", "2026-10-03T06:00:00Z")).toBe(false);
    expect(isSingleUtcDay("not a date", "2026-10-03T06:00:00Z")).toBe(false);
  });
});
