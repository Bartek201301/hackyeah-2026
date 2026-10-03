import { describe, expect, it } from "vitest";
import { check } from "@/shared/contracts/validate";
import { classifyResponse, classifyTerminalErrorCode } from "./envelope";
import { DEV_UNAVAILABLE_SEAM, devDecision, devEnvelope, devError } from "./fixtures";

describe("fixtures", () => {
  it("are valid Response envelopes under the published schema", () => {
    for (const body of [
      devEnvelope(),
      devDecision("ALLOW"),
      devDecision("BLOCK", ["ACCESS_DENIED"]),
      devError("RATE_LIMITED", "Actor request limit reached."),
      DEV_UNAVAILABLE_SEAM,
    ]) {
      expect(check("Response", body)).toEqual({ ok: true, value: body });
    }
  });
});

describe("classifyResponse — nothing is released without a decision", () => {
  it("treats 202 as created, not approved", () => {
    const out = classifyResponse(202, devEnvelope());
    expect(out.kind).toBe("progress");
    expect(out.showsResult).toBe(false);
    expect(out.decision).toBeNull();
  });

  it("releases a result only on ALLOW or REDACT", () => {
    expect(classifyResponse(200, devDecision("ALLOW")).showsResult).toBe(true);
    expect(classifyResponse(200, devDecision("REDACT")).showsResult).toBe(true);
    expect(classifyResponse(200, devDecision("REVIEW")).showsResult).toBe(false);
    expect(classifyResponse(200, devDecision("BLOCK")).showsResult).toBe(false);
  });

  it("returns only a reference for REVIEW", () => {
    const out = classifyResponse(200, devDecision("REVIEW"));
    expect(out.kind).toBe("review");
    expect(out.showsResult).toBe(false);
  });

  it("fails closed on 200 with no decision", () => {
    const out = classifyResponse(200, devEnvelope());
    expect(out.kind).toBe("unavailable");
    expect(out.showsResult).toBe(false);
  });

  it("fails closed on an unknown status and on a missing body", () => {
    expect(classifyResponse(418, devEnvelope()).kind).toBe("unavailable");
    expect(classifyResponse(200, null).kind).toBe("unavailable");
    expect(classifyResponse(500, null).showsResult).toBe(false);
  });
});

describe("classifyResponse — status mapping", () => {
  it.each([
    [400, "invalid"],
    [413, "invalid"],
    [415, "invalid"],
    [401, "unauthenticated"],
    [403, "denied"],
    [404, "notFound"],
    [409, "conflict"],
    [429, "refused"],
    [503, "unavailable"],
  ])("maps %i to %s", (status, kind) => {
    expect(classifyResponse(status, devEnvelope()).kind).toBe(kind);
  });

  it("never marks a conflict retryable, because resubmitting defeats the version check", () => {
    expect(classifyResponse(409, devEnvelope()).retryable).toBe(false);
  });

  it("does not reveal whether an inaccessible object exists", () => {
    const notFound = classifyResponse(404, devEnvelope()).detail;
    const denied = classifyResponse(403, devEnvelope()).detail;
    for (const text of [notFound, denied]) {
      expect(text).not.toMatch(/exist|deleted|removed|restricted|confidential|deal/i);
    }
  });

  it("keeps a 503 service error distinct from a policy denial", () => {
    const out = classifyResponse(503, DEV_UNAVAILABLE_SEAM);
    expect(out.kind).toBe("unavailable");
    expect(out.decision).toBeNull();
    expect(out.errorCode).toBe("STATE_UNAVAILABLE");
    expect(out.showsResult).toBe(false);
  });

  it("explains which service is unavailable", () => {
    expect(classifyResponse(503, devError("MODEL_UNAVAILABLE", "x", true)).detail).toMatch(/language model/i);
    expect(classifyResponse(503, devError("SEMANTIC_UNAVAILABLE", "x", true)).detail).toMatch(/assessment/i);
    expect(classifyResponse(503, devError("AUDIT_UNAVAILABLE", "x", true)).detail).toMatch(/audit/i);
  });

  it("reads a 403 with a content reason as a policy refusal, not an account problem", () => {
    const out = classifyResponse(403, devDecision("BLOCK", ["input_signature:SIG-001"]));
    expect(out.kind).toBe("denied");
    expect(out.title).toBe("Blocked");
    expect(out.detail).toMatch(/refused by the control policy/i);
    expect(out.detail).not.toMatch(/account/i);
    // The reason itself is what tells the actor which check refused; OutcomeNotice renders it.
    expect(out.reasons).toEqual(["input_signature:SIG-001"]);
  });

  it("keeps the account wording for a denial with no content reason", () => {
    for (const reasons of [[], ["ACCESS_DENIED"], ["ACCESS_DENIED", "deal scope"]]) {
      const out = classifyResponse(403, devDecision("BLOCK", reasons));
      expect(out.title).toBe("Not permitted");
      expect(out.detail).toMatch(/this account is not permitted/i);
    }
  });

  it("carries server reason labels through without interpreting them", () => {
    const out = classifyResponse(403, devDecision("BLOCK", ["ACCESS_DENIED", "deal scope"]));
    expect(out.reasons).toEqual(["ACCESS_DENIED", "deal scope"]);
  });

  it("surfaces the trace id when present", () => {
    expect(classifyResponse(503, DEV_UNAVAILABLE_SEAM).traceId).toBe(DEV_UNAVAILABLE_SEAM.trace_id);
  });
});

describe("classifyTerminalErrorCode", () => {
  it("recognises cancellation without claiming zero usage", () => {
    const out = classifyTerminalErrorCode(devError("CANCELLED", "Cancelled by actor."));
    expect(out?.kind).toBe("cancelled");
    expect(out?.detail).toMatch(/usage already incurred is still recorded/i);
  });

  it("recognises an incomplete run and withholds the result", () => {
    const out = classifyTerminalErrorCode(devError("INCOMPLETE", "Audit write failed."));
    expect(out?.kind).toBe("incomplete");
    expect(out?.showsResult).toBe(false);
    expect(out?.detail).toMatch(/uncertain/i);
  });

  it("returns null for every other code, leaving status classification in charge", () => {
    expect(classifyTerminalErrorCode(devError("RATE_LIMITED", "x"))).toBeNull();
    expect(classifyTerminalErrorCode(devEnvelope())).toBeNull();
    expect(classifyTerminalErrorCode(null)).toBeNull();
  });
});
