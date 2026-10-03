import { describe, expect, it } from "vitest";
import { devEnvelope, devError, devRun } from "./fixtures";
import { classifyImportResponse, readImportRun } from "./importRun";

const pending = devEnvelope({ data: devRun("pending", "quarantine", "import") });
const running = devEnvelope({ data: devRun("running", "assess", "import") });

/** How `executeImport` answers: 200, a decision, and the Run as data. */
const settled = (decision: "ALLOW" | "REDACT" | "REVIEW" | "BLOCK", reasons: string[] = []) =>
  devEnvelope({
    decision,
    reasons,
    policy_version: 1,
    feed_version: 1,
    data: devRun(decision === "REVIEW" ? "review" : "completed", "publish", "import"),
  });

describe("readImportRun", () => {
  it("accepts an import run and refuses any other kind", () => {
    expect(readImportRun(devRun("pending", "quarantine", "import"))).not.toBeNull();
    // A chat run must never be polled into the upload card.
    expect(readImportRun(devRun("pending", "queued", "chat"))).toBeNull();
    expect(readImportRun(null)).toBeNull();
  });
});

describe("classifyImportResponse — while the import is in flight", () => {
  it("reads a 202 creation as progress and keeps the run", () => {
    const { outcome, run } = classifyImportResponse(202, pending);
    expect(outcome.kind).toBe("progress");
    expect(outcome.showsResult).toBe(false);
    expect(run?.id).toBe(devRun("pending", "x", "import").id);
  });

  it("keeps the run on a 200 poll that is still running", () => {
    const { outcome, run } = classifyImportResponse(200, running);
    expect(outcome.kind).toBe("progress");
    expect(outcome.title).toBe("Running checks");
    expect(run).not.toBeNull();
  });
});

describe("classifyImportResponse — the decision the import settled on", () => {
  it("reports each decision in the words the import list uses, and ends the lifecycle", () => {
    const cases = [
      ["ALLOW", "Approved", "result"],
      ["REDACT", "Partially published", "result"],
      ["REVIEW", "Held for review", "review"],
      ["BLOCK", "Blocked", "denied"],
    ] as const;
    for (const [decision, title, kind] of cases) {
      const { outcome, run } = classifyImportResponse(200, settled(decision));
      expect(outcome.title).toBe(title);
      expect(outcome.kind).toBe(kind);
      expect(outcome.decision).toBe(decision);
      // Nothing stays in flight, so the poll and the progress badge stop together.
      expect(run).toBeNull();
      // The import publishes server-side; this screen never claims to hold the result.
      expect(outcome.showsResult).toBe(false);
    }
  });

  it("says a partial import removed something, not that it was approved", () => {
    const { outcome } = classifyImportResponse(200, settled("REDACT", ["secret:SEC-001"]));
    expect(outcome.detail).toContain("removed");
    expect(outcome.tone).toBe("warning");
    expect(outcome.reasons).toEqual(["secret:SEC-001"]);
  });

  it("does not read a content BLOCK as a completed run", () => {
    // imports.ts settles a content BLOCK with run state `completed`: the decision is what counts.
    expect(settled("BLOCK").data).toMatchObject({ state: "completed" });
    expect(classifyImportResponse(200, settled("BLOCK")).outcome.kind).toBe("denied");
  });
});

describe("classifyImportResponse — everything else fails closed", () => {
  it("carries the server's own message for a refused file", () => {
    const pdf = devError("UNSUPPORTED_FILE", "PDF import is not available in this demo build; upload a CSV.");
    const { outcome } = classifyImportResponse(415, pdf);
    expect(outcome.kind).toBe("invalid");
    expect(outcome.detail).toBe("PDF import is not available in this demo build; upload a CSV.");
  });

  it("carries the message that tells an analyst what the server requires", () => {
    const scope = devError("INVALID_INPUT", "Analyst uploads are restricted to the assigned deal.");
    expect(classifyImportResponse(400, scope).outcome.detail).toBe(
      "Analyst uploads are restricted to the assigned deal.",
    );
  });

  it("shows no decision for a 200 that carries none", () => {
    const { outcome, run } = classifyImportResponse(200, devEnvelope({ data: null }));
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.showsResult).toBe(false);
    expect(run).toBeNull();
  });

  it("classifies a terminal error code from the envelope, whatever the status", () => {
    const cancelled = devEnvelope({ error: { code: "CANCELLED", message: "", retryable: false } });
    const { outcome, run } = classifyImportResponse(200, cancelled);
    expect(outcome.kind).toBe("cancelled");
    expect(run).toBeNull();
  });
});
