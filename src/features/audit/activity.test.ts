import { describe, expect, it } from "vitest";
import {
  PAGE_CAP,
  activityRows,
  classifyActivityRead,
  filterRows,
  settledGenerationTokens,
} from "./activity";
import { envelope, projection, usage } from "./test-support";

const listOf = (items: unknown[]) => envelope({ data: { items } });

describe("activity rows", () => {
  it("shows the operation code, the UTC time and the decision as stored", () => {
    const [row] = activityRows([projection()]);
    expect(row.operation).toBe("chat_answer");
    expect(row.when).toBe("2026-10-03 09:41:06 UTC");
    expect(row.decisionLabel).toBe("Allowed");
    expect(row.decisionTone).toBe("success");
    expect(row.state).toBe("complete");
    expect(row.traceIdShort).toBe("3f6c1d2e…4c33");
    expect(row.traceId).toBe("3f6c1d2e-9b47-4c81-a0f5-7d2e5b914c33");
  });

  it("hides the actor in own scope and shows an identifier, never a name, in organisation scope", () => {
    expect(activityRows([projection()])[0].actorIdShort).toBeNull();
    expect(activityRows([projection()], { showActor: true })[0].actorIdShort).toBe("b17d9f40…2e19");
  });

  it("shows two reasons inline, as labels that keep their codes, and counts the rest", () => {
    const reasons = ["input_signature:SIG-001", "RESTRICTED_SOURCE", "DEAL_SCOPE", "AUDIENCE"];
    const [row] = activityRows([projection({ decision: "BLOCK", reasons })]);
    expect(row.inlineReasons).toEqual([
      { code: "input_signature:SIG-001", label: "Known prompt-injection pattern (SIG-001)", tone: "danger" },
      { code: "RESTRICTED_SOURCE", label: "RESTRICTED_SOURCE", tone: "neutral" },
    ]);
    expect(row.hiddenReasons).toBe(2);
    expect(activityRows([projection()])[0].hiddenReasons).toBe(0);
  });

  it("names the operation in words and keeps its code", () => {
    const [row] = activityRows([projection({ operation: "action_start" })]);
    expect(row.operation).toBe("Client action from chat");
    expect(row.operationCode).toBe("action_start");
  });

  it("filters the loaded rows by decision", () => {
    const rows = activityRows([
      projection({ trace_id: "a", decision: "BLOCK" }),
      projection({ trace_id: "b", decision: "REVIEW" }),
      projection({ trace_id: "c", decision: "ALLOW" }),
      projection({ trace_id: "d", decision: null, state: "failed" }),
    ]);
    expect(filterRows(rows, "all").map((row) => row.traceId)).toEqual(["a", "b", "c", "d"]);
    expect(filterRows(rows, "blocked").map((row) => row.traceId)).toEqual(["a"]);
    expect(filterRows(rows, "held").map((row) => row.traceId)).toEqual(["b"]);
    expect(filterRows(rows, "allowed").map((row) => row.traceId)).toEqual(["c"]);
  });

  it("marks a pending decision as pending rather than allowed", () => {
    const [row] = activityRows([projection({ decision: null, state: "running" })]);
    expect(row.decisionLabel).toBe("Pending");
    expect(row.decisionTone).toBe("neutral");
  });

  it("carries the unresolved reservation onto the row", () => {
    const [row] = activityRows([projection({ usage: usage({ unresolved_reservation: true }) })]);
    expect(row.unresolvedReservation).toBe(true);
  });
});

describe("settled generation tokens", () => {
  it("sums the two settled provider counts", () => {
    expect(settledGenerationTokens(projection())).toBe("2,393 tokens");
  });

  it("refuses to sum around an unknown side", () => {
    expect(settledGenerationTokens(projection({ usage: usage({ generation_output_tokens: null }) }))).toBe(
      "Not measured",
    );
    expect(settledGenerationTokens(projection({ usage: usage({ generation_input_tokens: null }) }))).toBe(
      "Not measured",
    );
  });

  it("reports a proven zero as zero", () => {
    const none = usage({ generation_input_tokens: 0, generation_output_tokens: 0 });
    expect(settledGenerationTokens(projection({ usage: none }))).toBe("0 tokens");
  });
});

describe("one page of the list", () => {
  it("never presents a full page as the whole history", () => {
    const items = Array.from({ length: PAGE_CAP }, (_, index) =>
      projection({ trace_id: `3f6c1d2e-9b47-4c81-a0f5-7d2e5b91${String(index).padStart(4, "0")}` }),
    );
    const state = classifyActivityRead(200, listOf(items));
    expect(state).toMatchObject({ kind: "ok", pageCapped: true });
    if (state.kind !== "ok") return;
    expect(state.rows).toHaveLength(PAGE_CAP);
    // The cursor is the last row, because the response carries no next-page field.
    expect(state.nextCursor).toBe(items[PAGE_CAP - 1].trace_id);
  });

  it("does not claim more records exist on a short page", () => {
    const state = classifyActivityRead(200, listOf([projection(), projection()]));
    expect(state).toMatchObject({ kind: "ok", pageCapped: false });
  });

  it("treats an empty day as empty, not as a failure", () => {
    const state = classifyActivityRead(200, listOf([]));
    expect(state).toMatchObject({ kind: "ok", pageCapped: false, nextCursor: null });
    if (state.kind !== "ok") return;
    expect(state.rows).toEqual([]);
  });

  it("passes a refusal through to the same states the other reads use", () => {
    const limited = envelope({ error: { code: "RATE_LIMITED", message: "slow down", retryable: true } });
    expect(classifyActivityRead(429, limited).kind).toBe("rateLimited");
    const session = envelope({ error: { code: "UNAUTHENTICATED", message: "gone", retryable: false } });
    expect(classifyActivityRead(401, session).kind).toBe("unauthenticated");
  });

  it("rejects a payload that is not an audit list", () => {
    expect(classifyActivityRead(200, envelope({ data: { answer: "text", citations: [] } })).kind).toBe(
      "clientError",
    );
  });
});
