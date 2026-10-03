import { describe, expect, it } from "vitest";
import { isTraceId, traceHref } from "./trace";
import { DEV_UNAVAILABLE_SEAM } from "./fixtures";

const VALID = "e1ea6faa-76b8-4ef5-a016-4046680be5ec";

describe("isTraceId", () => {
  it("accepts a UUID", () => {
    expect(isTraceId(VALID)).toBe(true);
    expect(isTraceId(DEV_UNAVAILABLE_SEAM.trace_id)).toBe(true);
  });

  it("rejects anything that is not a UUID", () => {
    for (const v of [null, undefined, "", "not-a-uuid", "../../audit", `${VALID} `] as const) {
      expect(isTraceId(v)).toBe(false);
    }
  });
});

describe("traceHref", () => {
  it("points at the audit feature's documented trace view", () => {
    expect(traceHref(VALID)).toBe(`/audit?trace=${VALID}`);
  });

  it("returns null when there is no usable trace, so no dead link is offered", () => {
    // technical-spec §9: a trace id may be ephemeral when the audit write failed.
    expect(traceHref(null)).toBeNull();
    expect(traceHref(undefined)).toBeNull();
    expect(traceHref("unknown")).toBeNull();
  });

  it("encodes the value rather than interpolating it raw", () => {
    expect(traceHref("a b")).toBeNull();
    const href = traceHref(VALID);
    expect(href).not.toMatch(/\s/);
  });
});
