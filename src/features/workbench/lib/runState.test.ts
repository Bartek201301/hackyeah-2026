import { describe, expect, it } from "vitest";
import type { Run } from "@/shared/contracts";
import {
  CANCEL_UNAVAILABLE,
  POLL_INTERVAL_MS,
  canCancel,
  cancelReachedDecision,
  describeRun,
  isTerminalRunState,
  progressLabel,
  shouldKeepPolling,
} from "./runState";
import { devRun } from "./fixtures";

const ALL_STATES: Run["state"][] = [
  "pending",
  "running",
  "completed",
  "review",
  "blocked",
  "failed",
  "cancel_requested",
  "cancelled",
  "incomplete",
];

describe("poll control", () => {
  it("uses the protocol one-second interval", () => {
    expect(POLL_INTERVAL_MS).toBe(1000);
  });

  it("treats every finished state as terminal", () => {
    for (const state of ["completed", "review", "blocked", "failed", "cancelled", "incomplete"] as const) {
      expect(isTerminalRunState(state)).toBe(true);
      expect(shouldKeepPolling(devRun(state, "done"))).toBe(false);
    }
  });

  it("keeps polling while work can still change", () => {
    for (const state of ["pending", "running", "cancel_requested"] as const) {
      expect(isTerminalRunState(state)).toBe(false);
      expect(shouldKeepPolling(devRun(state, "checking"))).toBe(true);
    }
  });

  it("keeps polling a requested cancellation, because a request is not a confirmation", () => {
    expect(shouldKeepPolling(devRun("cancel_requested", "cancelling"))).toBe(true);
    expect(isTerminalRunState("cancelled")).toBe(true);
  });

  it("stops when there is no run", () => {
    expect(shouldKeepPolling(null)).toBe(false);
  });

  it("covers every contract state", () => {
    for (const state of ALL_STATES) {
      expect(typeof isTerminalRunState(state)).toBe("boolean");
    }
  });
});

describe("cancellation availability", () => {
  it("offers cancel only while pending or running", () => {
    expect(canCancel(devRun("pending", "queued"))).toBe(true);
    expect(canCancel(devRun("running", "assessing"))).toBe(true);
    for (const state of [
      "cancel_requested",
      "completed",
      "review",
      "blocked",
      "failed",
      "cancelled",
      "incomplete",
    ] as const) {
      expect(canCancel(devRun(state, "x"))).toBe(false);
    }
    expect(canCancel(null)).toBe(false);
  });
});

describe("describeRun", () => {
  it("releases a result only for a completed run", () => {
    for (const state of ALL_STATES) {
      expect(describeRun(devRun(state, "x")).showsResult).toBe(state === "completed");
    }
  });

  it("marks only in-flight states busy", () => {
    expect(describeRun(devRun("running", "x")).busy).toBe(true);
    expect(describeRun(devRun("cancel_requested", "x")).busy).toBe(true);
    expect(describeRun(devRun("completed", "x")).busy).toBe(false);
  });

  it("says review content is withheld from the requester", () => {
    expect(describeRun(devRun("review", "held")).detail).toMatch(/not released to you/i);
  });

  it("does not claim zero usage for an incomplete run", () => {
    expect(describeRun(devRun("incomplete", "x")).detail).toMatch(/uncertain/i);
  });

  it("gives every state a label and detail", () => {
    for (const state of ALL_STATES) {
      const d = describeRun(devRun(state, "x"));
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("progressLabel", () => {
  it("shows the server stage verbatim rather than inventing one", () => {
    expect(progressLabel(devRun("running", "semantic assessment"))).toBe(
      "Running checks — semantic assessment",
    );
  });

  it("falls back to the state label when no stage is supplied", () => {
    expect(progressLabel(devRun("pending", ""))).toBe("Queued");
    expect(progressLabel(devRun("pending", "   "))).toBe("Queued");
  });
});

describe("a cancel request that carried no decision", () => {
  it("treats 503 as no decision, so the run is left alone", () => {
    // protocols.md: 503 carries no decision. The gateway recorded no cancellation, so the screen
    // must keep the run it already has instead of reporting a service error as the run's outcome.
    expect(cancelReachedDecision(503)).toBe(false);
  });

  it("lets every other answer settle the run, including a refusal", () => {
    // 202 accepted, 200 already terminal, 403 not permitted, 404 not visible, 409 stale read: each
    // is a real answer about the run and belongs in the outcome notice.
    for (const status of [200, 202, 400, 403, 404, 409, 429, 500]) {
      expect(cancelReachedDecision(status)).toBe(true);
    }
  });

  it("says the run is still running, and never that it was cancelled", () => {
    expect(CANCEL_UNAVAILABLE).toMatch(/not stopped/);
    expect(CANCEL_UNAVAILABLE).not.toMatch(/cancelled/i);
  });
});
