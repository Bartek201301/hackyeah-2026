import { describe, expect, it } from "vitest";
import { readChatResult, readChatRun, readRun, readSourceSelection } from "./chatData";

it("accepts only a bounded gateway file selection", () => {
  const sources = [
    { id: "11111111-1111-4111-8111-111111111111", label: "MIX-01.csv", created_at: "2026-10-04T01:00:00Z" },
    { id: "22222222-2222-4222-8222-222222222222", label: "MIX-01.csv", created_at: "2026-10-04T02:00:00Z" },
  ];
  expect(readSourceSelection({ selection_required: true, sources })).toEqual(sources);
  expect(readSourceSelection({ selection_required: true, sources: [sources[0]] })).toBeNull();
  expect(
    readSourceSelection({ selection_required: true, sources: [{ ...sources[0], id: "bad" }, sources[1]] }),
  ).toBeNull();
});
import { devCitation, devRun } from "./fixtures";

describe("readRun", () => {
  it("accepts a contract-valid run", () => {
    expect(readRun(devRun("running", "assessing"))).toEqual(devRun("running", "assessing"));
  });

  it("rejects null, primitives and arrays", () => {
    for (const v of [null, undefined, 1, "run", [], [devRun("pending", "x")]] as const) {
      expect(readRun(v as never)).toBeNull();
    }
  });

  it("rejects an unknown state or kind rather than trusting the key names", () => {
    expect(readRun({ ...devRun("pending", "x"), state: "approved" } as never)).toBeNull();
    expect(readRun({ ...devRun("pending", "x"), kind: "audit" } as never)).toBeNull();
  });

  it("rejects a run with a missing or wrongly typed field", () => {
    expect(readRun({ id: "", kind: "chat", state: "pending", stage: "x" } as never)).toBeNull();
    expect(readRun({ id: "a", kind: "chat", state: "pending" } as never)).toBeNull();
    expect(readRun({ id: "a", kind: "chat", state: "pending", stage: 5 } as never)).toBeNull();
  });
});

describe("readChatRun", () => {
  it("accepts only a chat run", () => {
    expect(readChatRun(devRun("running", "x", "chat"))?.kind).toBe("chat");
    expect(readChatRun(devRun("running", "x", "import"))).toBeNull();
    expect(readChatRun(devRun("running", "x", "export"))).toBeNull();
  });
});

describe("readChatResult", () => {
  it("accepts a completed chat payload", () => {
    const data = { answer: "USD 120 million in FY2025.", citations: [devCitation()] };
    expect(readChatResult(data)).toEqual(data);
  });

  it("accepts an answer with no citations", () => {
    expect(readChatResult({ answer: "No evidence is available.", citations: [] })).toEqual({
      answer: "No evidence is available.",
      citations: [],
    });
  });

  it("rejects another operation's member of the same data union", () => {
    expect(
      readChatResult({
        download_path: "/api/v1/exports/x/download",
        expires_at: "2026-10-04T09:00:00Z",
      } as never),
    ).toBeNull();
    expect(readChatResult(devRun("completed", "done"))).toBeNull();
    expect(readChatResult({ version: 2 } as never)).toBeNull();
    expect(readChatResult({ items: [] } as never)).toBeNull();
  });

  it("rejects an empty answer and a non-array citations field", () => {
    expect(readChatResult({ answer: "", citations: [] } as never)).toBeNull();
    expect(readChatResult({ answer: "x", citations: null } as never)).toBeNull();
  });

  it("rejects malformed citations instead of rendering them", () => {
    expect(readChatResult({ answer: "x", citations: [{ excerpt_id: "a" }] } as never)).toBeNull();
    expect(
      readChatResult({
        answer: "x",
        citations: [devCitation(), { ...devCitation(), excerpt_version: "2" }],
      } as never),
    ).toBeNull();
  });
});
