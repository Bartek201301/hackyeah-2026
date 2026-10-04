import { describe, expect, it } from "vitest";
import { classifyGuardTool, parseGuardRequest, stableGuardKey } from "./guard-request";

const policy = {
  allowed_tools: ["Read", "Edit", "Write", "mcp__interlock__search_excerpts"],
  editable_extensions: [".ts", ".md"],
};
const tool = (tool_name: string, relative_path?: string, proposed_text?: string) => ({
  event_type: "tool" as const,
  event_id: "event",
  tool_name,
  relative_path,
  proposed_text,
});

describe("strict guard inputs", () => {
  it("rejects caller identity, unknown fields and oversized edits", () => {
    expect(
      parseGuardRequest({ event_type: "prompt", event_id: "x", prompt: "hello", role: "admin" }),
    ).toBeNull();
    expect(
      parseGuardRequest({ event_type: "tool", event_id: "x", tool_name: "Edit", actor_id: "x" }),
    ).toBeNull();
    expect(
      parseGuardRequest({
        event_type: "tool",
        event_id: "x",
        tool_name: "Edit",
        proposed_text: "x".repeat(2001),
      }),
    ).toBeNull();
  });
  it("allows small source edits but denies shell, hidden paths, traversal and protected config", () => {
    expect(
      classifyGuardTool(tool("Edit", "src/example.ts", "export const x = 2"), policy).hardReason,
    ).toBeUndefined();
    expect(classifyGuardTool(tool("Bash"), policy).hardReason).toBe("TOOL_NOT_ALLOWED");
    for (const path of [
      "src/../.env",
      "src/.secret.ts",
      "src/AGENTS.md",
      "other/example.ts",
      "src/package.json",
    ])
      expect(classifyGuardTool(tool("Read", path), policy).hardReason).toBe("PATH_NOT_ALLOWED");
  });
  it("derives a stable request key without putting submitted text in the key", () => {
    expect(stableGuardKey("t", "e", "prompt")).toBe(stableGuardKey("t", "e", "prompt"));
    expect(stableGuardKey("t", "e", "prompt")).not.toBe(stableGuardKey("t", "e", "tool"));
  });
});
