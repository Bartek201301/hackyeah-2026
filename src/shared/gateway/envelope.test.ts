import { describe, expect, it } from "vitest";
import type { ErrorCode } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { envelope, errorOutcome, STATUS, toResponse } from "./envelope";

const codes = Object.keys(STATUS) as ErrorCode[];

describe("errorOutcome", () => {
  it.each(codes)("%s produces a valid Response envelope", (code) => {
    const { body } = errorOutcome(code);
    expect(check("Response", body)).toEqual({ ok: true, value: body });
    expect(body.error?.code).toBe(code);
  });

  it("blocks only on 401/403/429 and never signals existence on 404", () => {
    const decisionAt = (status: number) => [
      ...new Set(codes.filter((c) => STATUS[c] === status).map((c) => errorOutcome(c).body.decision)),
    ];
    for (const s of [401, 403, 429]) expect(decisionAt(s)).toEqual(["BLOCK"]);
    for (const s of [400, 404, 409, 503]) expect(decisionAt(s)).toEqual([null]);
  });

  it("allows a status override for 413", () => {
    const outcome = errorOutcome("INVALID_INPUT", { status: 413 });
    expect(outcome.status).toBe(413);
    expect(outcome.body.decision).toBeNull();
  });

  it("marks only 5xx as retryable with an unavailable assessment", () => {
    expect(errorOutcome("MODEL_UNAVAILABLE").body).toMatchObject({
      error: { retryable: true },
      semantic: { status: "unavailable" },
    });
    expect(errorOutcome("ACCESS_DENIED").body).toMatchObject({
      error: { retryable: false },
      semantic: { status: "not_required" },
    });
  });
});

describe("envelope and toResponse", () => {
  it("fills a valid envelope from a trace id", () => {
    const body = envelope({ trace_id: crypto.randomUUID() });
    expect(check("Response", body)).toEqual({ ok: true, value: body });
  });

  it("sets no-store", () => {
    const res = toResponse(errorOutcome("NOT_FOUND"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
