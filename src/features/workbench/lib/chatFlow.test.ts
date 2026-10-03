import { describe, expect, it } from "vitest";
import { check } from "@/shared/contracts/validate";
import type { Run } from "@/shared/contracts";
import { classifyChatResponse } from "./chatFlow";
import { DEV_UNAVAILABLE_SEAM, devCitation, devEnvelope, devError, devRun } from "./fixtures";

/** 202 create, then a pending run on poll — the normal G2 path before completion. */
const pending = (state: Run["state"], stage = "assessing") =>
  devEnvelope({ data: devRun(state, stage), policy_version: 1, feed_version: 1 });

const completed = (answer = "AsterCloud reported USD 120 million in FY2025.") =>
  devEnvelope({
    decision: "ALLOW",
    policy_version: 1,
    feed_version: 1,
    data: { answer, citations: [devCitation()] },
  });

describe("fixtures used here are contract-valid", () => {
  it("validates against the published Response schema", () => {
    for (const body of [pending("running"), completed()]) {
      expect(check("Response", body)).toEqual({ ok: true, value: body });
    }
  });
});

describe("a run still in flight is progress, not a failure", () => {
  it("does not fail closed on 200 with a pending run and no decision", () => {
    // The regression this module exists for: decision is null by contract while pending.
    for (const state of ["pending", "running", "cancel_requested"] as const) {
      const { outcome, run } = classifyChatResponse(200, pending(state));
      expect(outcome.kind, state).toBe("progress");
      expect(outcome.showsResult).toBe(false);
      expect(run?.state).toBe(state);
    }
  });

  it("treats a 202 create the same way", () => {
    const { outcome, run } = classifyChatResponse(202, pending("pending", "queued"));
    expect(outcome.kind).toBe("progress");
    expect(run?.id).toBeTruthy();
  });

  it("shows the server's stage verbatim", () => {
    const { outcome } = classifyChatResponse(200, pending("running", "semantic assessment"));
    expect(outcome.title).toBe("Running checks — semantic assessment");
  });

  it("never releases a result while in flight", () => {
    const { outcome } = classifyChatResponse(200, pending("running"));
    expect(outcome.showsResult).toBe(false);
  });
});

describe("a run that ended without releasing", () => {
  it.each([
    ["review", "review"],
    ["blocked", "denied"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["incomplete", "incomplete"],
  ] as const)("maps run state %s to outcome %s", (state, kind) => {
    const { outcome } = classifyChatResponse(200, pending(state, "done"));
    expect(outcome.kind).toBe(kind);
    expect(outcome.showsResult).toBe(false);
  });

  it("says review content is withheld from the requester", () => {
    const { outcome } = classifyChatResponse(200, pending("review", "held"));
    expect(outcome.detail).toMatch(/not released to you/i);
  });

  it("does not claim zero usage for an incomplete run", () => {
    const { outcome } = classifyChatResponse(200, pending("incomplete", "x"));
    expect(outcome.detail).toMatch(/uncertain/i);
  });
});

describe("completion is still gated by the decision", () => {
  it("releases a completed answer on ALLOW", () => {
    const { outcome } = classifyChatResponse(200, completed());
    expect(outcome.kind).toBe("result");
    expect(outcome.showsResult).toBe(true);
  });

  it("withholds a completed payload that carries no decision", () => {
    const body = devEnvelope({ data: { answer: "x", citations: [] } });
    const { outcome } = classifyChatResponse(200, body);
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.showsResult).toBe(false);
  });

  it("withholds on BLOCK even with an answer present", () => {
    const body = devEnvelope({ decision: "BLOCK", data: { answer: "x", citations: [] } });
    const { outcome } = classifyChatResponse(200, body);
    expect(outcome.showsResult).toBe(false);
  });

  it("does not treat a completed run object as a releasable answer", () => {
    // state=completed but the payload is a Run, not {answer,citations}: nothing to release.
    const { outcome } = classifyChatResponse(200, pending("completed", "done"));
    expect(outcome.showsResult).toBe(false);
  });
});

describe("error codes and statuses still win", () => {
  it("prefers a terminal error code over a live-looking run", () => {
    const body = devEnvelope({
      data: devRun("running", "assessing"),
      error: { code: "CANCELLED", message: "Cancelled by actor.", retryable: false },
    });
    const { outcome } = classifyChatResponse(200, body);
    expect(outcome.kind).toBe("cancelled");
  });

  it("prefers INCOMPLETE over a live-looking run", () => {
    const body = devEnvelope({
      data: devRun("running", "assessing"),
      error: { code: "INCOMPLETE", message: "Audit write failed.", retryable: false },
    });
    expect(classifyChatResponse(200, body).outcome.kind).toBe("incomplete");
  });

  it("keeps the 503 seam behaviour", () => {
    const { outcome } = classifyChatResponse(503, DEV_UNAVAILABLE_SEAM);
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.errorCode).toBe("STATE_UNAVAILABLE");
  });

  it("does not let a run body soften a denial or a refusal", () => {
    expect(classifyChatResponse(403, pending("running")).outcome.kind).toBe("denied");
    expect(classifyChatResponse(429, pending("running")).outcome.kind).toBe("refused");
    expect(classifyChatResponse(409, pending("running")).outcome.kind).toBe("conflict");
    expect(classifyChatResponse(401, pending("running")).outcome.kind).toBe("unauthenticated");
  });

  it("renders a signed-out state for 401", () => {
    const { outcome } = classifyChatResponse(401, devError("UNAUTHENTICATED", "No session."));
    expect(outcome.kind).toBe("unauthenticated");
    expect(outcome.title).toMatch(/signed out/i);
    expect(outcome.detail).toMatch(/sign in again/i);
  });

  it("ignores a run belonging to another operation", () => {
    const body = devEnvelope({ data: devRun("running", "x", "export") });
    // Not a chat run, so there is no progress to report and the generic rules apply.
    expect(classifyChatResponse(200, body).run).toBeNull();
    expect(classifyChatResponse(200, body).outcome.kind).toBe("unavailable");
  });
});

describe("only a run still in flight is handed back", () => {
  // The screen polls, offers Cancel and shows "Running checks" off this run, so a response that
  // ended the lifecycle must return none of it.
  it("keeps the run while work is in flight", () => {
    for (const state of ["pending", "running", "cancel_requested"] as const) {
      expect(classifyChatResponse(200, pending(state)).run?.state).toBe(state);
    }
    expect(classifyChatResponse(202, pending("pending")).run).not.toBeNull();
  });

  it("drops the run on every terminal response", () => {
    for (const state of ["completed", "review", "blocked", "failed", "cancelled", "incomplete"] as const) {
      expect(classifyChatResponse(200, pending(state)).run).toBeNull();
    }
    // A live-looking run body does not keep the lifecycle open past a terminal status or error code.
    expect(classifyChatResponse(403, pending("running")).run).toBeNull();
    expect(classifyChatResponse(503, DEV_UNAVAILABLE_SEAM).run).toBeNull();
    expect(
      classifyChatResponse(
        200,
        devEnvelope({
          data: devRun("running", "assessing"),
          error: { code: "CANCELLED", message: "Cancelled by actor.", retryable: false },
        }),
      ).run,
    ).toBeNull();
    expect(classifyChatResponse(200, completed()).run).toBeNull();
  });
});

describe("trace and reasons survive classification", () => {
  it("carries the trace id and reason labels through a progress response", () => {
    const body = devEnvelope({ data: devRun("running", "x"), reasons: ["scope checked"] });
    const { outcome } = classifyChatResponse(200, body);
    expect(outcome.traceId).toBe(body.trace_id);
    expect(outcome.reasons).toEqual(["scope checked"]);
  });
});
