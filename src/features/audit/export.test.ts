import { describe, expect, it } from "vitest";
import {
  EXPORT_ROW_CAP,
  classifyExportResponse,
  exportPath,
  fallbackFilename,
  parseContentDisposition,
} from "./export";
import { envelope } from "./test-support";

const now = new Date("2026-10-03T12:00:00.000Z");
const EXPORT_TRACE = "7c2e5b91-4c33-4a6b-8c9d-0e1f2a3b4c5d";

// `in` rather than `??`, so a test can pass an explicitly absent header.
const csv = (headers: { traceId?: string | null; contentDisposition?: string | null } = {}) =>
  classifyExportResponse(
    200,
    "text/csv; charset=utf-8",
    null,
    {
      traceId: "traceId" in headers ? (headers.traceId ?? null) : EXPORT_TRACE,
      contentDisposition: headers.contentDisposition ?? null,
    },
    "own",
    now,
  );

const refusal = (status: number, code: string, message: string) =>
  classifyExportResponse(
    status,
    "application/json",
    envelope({ error: { code, message, retryable: false } }),
    { traceId: null, contentDisposition: null },
    "own",
    now,
  );

describe("the request", () => {
  it("asks for the scope the screen is showing", () => {
    expect(exportPath("own")).toBe("/audit/export?scope=own");
    expect(exportPath("organisation")).toBe("/audit/export?scope=organisation");
  });

  it("names the file after the scope and the UTC day", () => {
    expect(fallbackFilename("own", now)).toBe("audit-own-2026-10-03.csv");
    expect(fallbackFilename("organisation", new Date("2026-01-09T23:59:00Z"))).toBe(
      "audit-organisation-2026-01-09.csv",
    );
  });
});

describe("the filename the server asks for", () => {
  it("is used when it is a plain name", () => {
    expect(parseContentDisposition('attachment; filename="audit-2026-10-03.csv"')).toBe(
      "audit-2026-10-03.csv",
    );
    expect(parseContentDisposition("attachment; filename=audit.csv")).toBe("audit.csv");
  });

  it("is refused when it tries to steer where the file lands", () => {
    expect(parseContentDisposition('attachment; filename="../../etc/passwd"')).toBeNull();
    expect(parseContentDisposition('attachment; filename="/tmp/x.csv"')).toBeNull();
    expect(parseContentDisposition('attachment; filename="..\\\\win.ini"')).toBeNull();
    expect(parseContentDisposition(null)).toBeNull();
    expect(parseContentDisposition("attachment")).toBeNull();
  });
});

describe("a successful export", () => {
  it("reports the export trace identifier, because the download is itself an audited access", () => {
    expect(csv()).toEqual({ kind: "done", traceId: EXPORT_TRACE, filename: "audit-own-2026-10-03.csv" });
  });

  it("still succeeds, and says so, when no trace header arrives", () => {
    expect(csv({ traceId: null })).toMatchObject({ kind: "done", traceId: null });
  });

  it("prefers the server's filename when it is safe", () => {
    expect(csv({ contentDisposition: 'attachment; filename="audit-admin-day.csv"' })).toMatchObject({
      filename: "audit-admin-day.csv",
    });
  });

  it("is not claimed for a 200 that is not a CSV", () => {
    const state = classifyExportResponse(
      200,
      "application/json",
      envelope({ error: { code: "ACCESS_DENIED", message: "no", retryable: false } }),
      { traceId: null, contentDisposition: null },
      "own",
      now,
    );
    expect(state.kind).toBe("denied");
  });
});

describe("the row cap", () => {
  it("is a refusal with the narrowing instruction, never a truncated file", () => {
    const state = refusal(
      400,
      "INVALID_INPUT",
      `This export exceeds ${EXPORT_ROW_CAP} rows. Narrow the scope or the day and request it again.`,
    );
    expect(state).toEqual({
      kind: "overCap",
      message: `This export exceeds ${EXPORT_ROW_CAP} rows. Narrow the scope or the day and request it again.`,
    });
  });

  it("does not swallow an ordinary range error", () => {
    expect(refusal(400, "INVALID_INPUT", "Select a range inside a single UTC day.").kind).toBe(
      "invalidInput",
    );
  });
});

describe("other refusals use the states the rest of the feature uses", () => {
  it("maps each code the export can return", () => {
    expect(refusal(403, "ACCESS_DENIED", "no").kind).toBe("denied");
    expect(refusal(401, "UNAUTHENTICATED", "no").kind).toBe("unauthenticated");
    expect(refusal(429, "RATE_LIMITED", "slow").kind).toBe("rateLimited");
    expect(refusal(503, "AUDIT_UNAVAILABLE", "later").kind).toBe("auditUnavailable");
    expect(refusal(503, "STATE_UNAVAILABLE", "later").kind).toBe("stateUnavailable");
  });

  it("falls back to a client error for an unreadable response", () => {
    const state = classifyExportResponse(
      502,
      "text/html",
      "<html>bad gateway</html>",
      { traceId: null, contentDisposition: null },
      "own",
      now,
    );
    expect(state.kind).toBe("clientError");
  });
});
