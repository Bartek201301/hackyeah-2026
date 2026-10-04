import { createHash } from "node:crypto";

export type GuardRequest =
  | { event_type: "prompt"; event_id: string; prompt: string }
  | {
      event_type: "tool";
      event_id: string;
      tool_name: string;
      relative_path?: string;
      proposed_text?: string;
    };

const owns = (value: object, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const bytes = (value: string) => Buffer.byteLength(value, "utf8");

export function parseGuardRequest(value: unknown): GuardRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.event_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.event_id)) return null;
  if (v.event_type === "prompt") {
    if (
      !owns(v, ["event_type", "event_id", "prompt"]) ||
      typeof v.prompt !== "string" ||
      !v.prompt ||
      bytes(v.prompt) > 6000
    )
      return null;
    return { event_type: "prompt", event_id: v.event_id, prompt: v.prompt };
  }
  if (v.event_type === "tool") {
    if (
      !owns(v, ["event_type", "event_id", "tool_name", "relative_path", "proposed_text"]) ||
      typeof v.tool_name !== "string" ||
      !/^[A-Za-z0-9_]{1,100}$/.test(v.tool_name) ||
      (v.relative_path !== undefined &&
        (typeof v.relative_path !== "string" || bytes(v.relative_path) > 300)) ||
      (v.proposed_text !== undefined &&
        (typeof v.proposed_text !== "string" || bytes(v.proposed_text) > 2000))
    )
      return null;
    return {
      event_type: "tool",
      event_id: v.event_id,
      tool_name: v.tool_name,
      ...(v.relative_path === undefined ? {} : { relative_path: v.relative_path }),
      ...(v.proposed_text === undefined ? {} : { proposed_text: v.proposed_text }),
    };
  }
  return null;
}

export function stableGuardKey(tokenId: string, eventId: string, stage: string): string {
  const hex = createHash("sha256").update(`${tokenId}:${stage}:${eventId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const TOOL_MAX = new Set([
  "Read",
  "Edit",
  "Write",
  "mcp__interlock__search_excerpts",
  "mcp__interlock__read_excerpt",
]);
const EDIT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css"]);
const DENIED_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "AGENTS.md",
  "CLAUDE.md",
]);

export function classifyGuardTool(
  request: Extract<GuardRequest, { event_type: "tool" }>,
  policy: { allowed_tools: string[]; editable_extensions: string[] },
): { text: string; hardReason?: "TOOL_NOT_ALLOWED" | "PATH_NOT_ALLOWED" | "EDIT_TOO_LARGE" } {
  const name = request.tool_name;
  if (!TOOL_MAX.has(name) || !policy.allowed_tools.includes(name))
    return { text: name, hardReason: "TOOL_NOT_ALLOWED" };
  if (name.startsWith("mcp__interlock__")) return { text: `${name} ${request.proposed_text ?? ""}` };
  const path = request.relative_path ?? "";
  const segments = path.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = [...EDIT_EXT].find((ext) => basename.endsWith(ext));
  if (
    !path.startsWith("src/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    segments.some((part) => !part || part === "." || part === ".." || part.startsWith(".")) ||
    DENIED_NAMES.has(basename) ||
    !extension ||
    !policy.editable_extensions.includes(extension)
  )
    return { text: name, hardReason: "PATH_NOT_ALLOWED" };
  if ((name === "Edit" || name === "Write") && !request.proposed_text)
    return { text: name, hardReason: "EDIT_TOO_LARGE" };
  return { text: `${name} ${path}${request.proposed_text ? `\n${request.proposed_text}` : ""}` };
}
