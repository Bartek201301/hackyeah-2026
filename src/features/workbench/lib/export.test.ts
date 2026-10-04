import { describe, expect, it } from "vitest";
import type { ApiResponse, Run } from "@/shared/contracts";
import {
  MAX_TOPIC,
  classifyExportResponse,
  expiryInstant,
  expiryLabel,
  hasExpired,
  isGatewayDownloadPath,
  readExportReady,
  readExportRun,
  validateTopic,
} from "./export";

type Data = ApiResponse["data"];
const parseReady = (value: unknown) => readExportReady(value as Data);
const parseRun = (value: unknown) => readExportRun(value as Data);

const ready = { download_path: "/api/v1/exports/abc/download", expires_at: "2026-10-04T09:00:00.000Z" };

const run = (state: Run["state"], kind: Run["kind"] = "export"): Run => ({
  id: "33333333-3333-4333-8333-333333333333",
  kind,
  state,
  stage: "generating",
});

const envelope = (over: Partial<ApiResponse> = {}): ApiResponse =>
  ({
    trace_id: "44444444-4444-4444-8444-444444444444",
    decision: null,
    reasons: [],
    policy_version: 1,
    feed_version: 1,
    semantic: { status: "not_required" },
    usage: {},
    timings: {},
    data: null,
    error: null,
    ...over,
  }) as unknown as ApiResponse;

describe("isGatewayDownloadPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(isGatewayDownloadPath("/api/v1/exports/abc/download")).toBe(true);
  });

  it("refuses anything that would leave this origin", () => {
    // A public Storage URL is exactly what protocols.md forbids here.
    expect(isGatewayDownloadPath("https://storage.example.com/bucket/file.pdf")).toBe(false);
    expect(isGatewayDownloadPath("//evil.example.com/file.pdf")).toBe(false);
    // A browser resolves a backslash like a slash, so this leaves the origin exactly as "//" does.
    expect(isGatewayDownloadPath("/\\evil.example.com/file.pdf")).toBe(false);
    expect(isGatewayDownloadPath("/\\")).toBe(false);
    expect(isGatewayDownloadPath("javascript:alert(1)")).toBe(false);
    expect(isGatewayDownloadPath("exports/abc/download")).toBe(false);
    expect(isGatewayDownloadPath(null)).toBe(false);
  });
});

describe("readExportReady", () => {
  it("reads a completed export payload", () => {
    expect(parseReady(ready)).toEqual({
      downloadPath: "/api/v1/exports/abc/download",
      expiresAt: "2026-10-04T09:00:00.000Z",
    });
  });

  it("rejects another operation's payload", () => {
    expect(parseReady({ answer: "text", citations: [] })).toBeNull();
    expect(parseReady(run("completed"))).toBeNull();
    expect(parseReady(null)).toBeNull();
  });

  it("rejects an off-origin download path", () => {
    expect(parseReady({ ...ready, download_path: "https://storage.example.com/x.pdf" })).toBeNull();
  });

  it("rejects an unparseable expiry rather than showing a bad deadline", () => {
    expect(parseReady({ ...ready, expires_at: "soon" })).toBeNull();
    expect(parseReady({ ...ready, expires_at: 123 })).toBeNull();
  });
});

describe("readExportRun", () => {
  it("accepts only an export run", () => {
    expect(parseRun(run("pending"))?.kind).toBe("export");
    expect(parseRun(run("pending", "chat"))).toBeNull();
    expect(parseRun(run("pending", "import"))).toBeNull();
  });
});

describe("expiry", () => {
  it("prints the UTC instant", () => {
    expect(expiryInstant("2026-10-04T09:00:00Z")).toBe("2026-10-04T09:00:00.000Z");
    expect(expiryInstant("nonsense")).toBeNull();
  });

  it("labels the expiry for a reader, with the zone it is in", () => {
    // Fixed zone so the assertion is the same on every machine; the app passes none and uses the
    // reader's own. The zone must be there: a bare local time is a deadline read in the wrong zone.
    expect(expiryLabel("2026-10-04T09:00:00Z", "UTC")).toBe("4 Oct 2026, 09:00 UTC");
    // The same instant, somewhere else: different clock time, and the label says which.
    expect(expiryLabel("2026-10-04T09:00:00Z", "Europe/Warsaw")).toContain("11:00");
    expect(expiryLabel("2026-10-04T09:00:00Z", "Europe/Warsaw")).not.toContain("UTC");
    expect(expiryLabel("nonsense")).toBeNull();
  });

  it("treats a passed expiry as expired", () => {
    const now = Date.parse("2026-10-04T10:00:00Z");
    expect(hasExpired("2026-10-04T09:00:00Z", now)).toBe(true);
    expect(hasExpired("2026-10-04T11:00:00Z", now)).toBe(false);
  });

  it("treats an unreadable expiry as expired, never as valid", () => {
    expect(hasExpired("nonsense")).toBe(true);
  });
});

describe("validateTopic", () => {
  it("trims and accepts", () => {
    const result = validateTopic("  AsterCloud revenue  ");
    expect(result).toEqual({ ok: true, topic: "AsterCloud revenue" });
  });

  it("refuses an empty topic", () => {
    expect(validateTopic("   ").ok).toBe(false);
  });

  it("enforces the contract maximum", () => {
    const result = validateTopic("a".repeat(MAX_TOPIC + 1));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(String(MAX_TOPIC));
  });
});

describe("classifyExportResponse", () => {
  it("reads a pending run as progress, not as a service failure", () => {
    // A pending run carries decision: null by contract; the generic classifier would fail closed.
    const { outcome } = classifyExportResponse(200, envelope({ data: run("pending") as unknown as Data }));
    expect(outcome.kind).toBe("progress");
    expect(outcome.showsResult).toBe(false);
  });

  it("keeps a created run as progress", () => {
    const { outcome, run: polled } = classifyExportResponse(
      202,
      envelope({ data: run("running") as unknown as Data }),
    );
    expect(outcome.kind).toBe("progress");
    expect(polled?.state).toBe("running");
  });

  it("maps terminal states that release nothing", () => {
    for (const [state, kind] of [
      ["blocked", "denied"],
      ["review", "review"],
      ["failed", "failed"],
      ["cancelled", "cancelled"],
      ["incomplete", "incomplete"],
    ] as const) {
      const { outcome } = classifyExportResponse(200, envelope({ data: run(state) as unknown as Data }));
      expect(outcome.kind).toBe(kind);
      expect(outcome.showsResult).toBe(false);
    }
  });

  it("gates a completed payload on the decision", () => {
    const withheld = classifyExportResponse(200, envelope({ data: ready as unknown as Data }));
    expect(withheld.outcome.showsResult).toBe(false);

    const released = classifyExportResponse(
      200,
      envelope({ decision: "ALLOW", data: ready as unknown as Data }),
    );
    expect(released.outcome.showsResult).toBe(true);
    // A file, not an answer: the chat classifier's "Answer ready … this answer" headline sat above
    // a card announcing the same summary, and read as two separate events.
    expect(released.outcome.title).toBe("Summary released");
    expect(released.outcome.detail).not.toMatch(/answer/i);
    // And it claims nothing about what the summary covers: the response carries only the path and
    // the expiry, so a summary that cites nothing looks exactly like a full one from here.
    expect(released.outcome.detail).not.toMatch(/citation|source/i);
  });

  it("puts a terminal error code ahead of a live-looking run", () => {
    const { outcome } = classifyExportResponse(
      200,
      envelope({
        data: run("running") as unknown as Data,
        error: { code: "CANCELLED", message: "", retryable: false },
      }),
    );
    expect(outcome.kind).toBe("cancelled");
  });

  it("hands back only a run still in flight", () => {
    // Polling, Cancel and the progress badge all hang off this run, so a terminal response
    // must return none of it.
    expect(
      classifyExportResponse(200, envelope({ data: run("running") as unknown as Data })).run,
    ).not.toBeNull();
    for (const state of ["completed", "blocked", "failed", "cancelled", "incomplete"] as const) {
      expect(classifyExportResponse(200, envelope({ data: run(state) as unknown as Data })).run).toBeNull();
    }
    expect(classifyExportResponse(403, envelope({ data: run("running") as unknown as Data })).run).toBeNull();
  });

  it("fails closed on a service error", () => {
    const { outcome } = classifyExportResponse(
      503,
      envelope({ error: { code: "MODEL_UNAVAILABLE", message: "", retryable: true } }),
    );
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.showsResult).toBe(false);
  });
});
