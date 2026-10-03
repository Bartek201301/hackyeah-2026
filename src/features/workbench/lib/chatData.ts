/*
 * Runtime narrowing of the shared `data` union.
 *
 * docs/contracts/protocols.md: "Do not include the generic `data` union member for a different
 * operation: validate operation-specific shape in tests." `Response.data` is one `anyOf` covering
 * every operation, so a chat screen that trusted it structurally could render an export path or a
 * review object. These guards accept only the shape the operation is contracted to return.
 */
import type { ApiResponse, Citation, Run } from "@/shared/contracts";

type Data = ApiResponse["data"];

const RUN_KINDS = new Set(["import", "chat", "export"]);
const RUN_STATES = new Set([
  "pending",
  "running",
  "completed",
  "review",
  "blocked",
  "failed",
  "cancel_requested",
  "cancelled",
  "incomplete",
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Narrow to a Run, checking the enums rather than just the keys. */
export function readRun(data: Data): Run | null {
  // `Data` is a union of object types; widen to unknown so the guard actually narrows.
  const o: unknown = data;
  if (!isRecord(o)) return null;
  const { id, kind, state, stage } = o;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof kind !== "string" || !RUN_KINDS.has(kind)) return null;
  if (typeof state !== "string" || !RUN_STATES.has(state)) return null;
  if (typeof stage !== "string") return null;
  return { id, kind, state, stage } as Run;
}

/** A run of the kind this screen started. Guards against polling someone else's run shape. */
export function readChatRun(data: Data): Run | null {
  const run = readRun(data);
  return run && run.kind === "chat" ? run : null;
}

export type ChatResult = { answer: string; citations: Citation[] };

const isCitation = (v: unknown): v is Citation =>
  isRecord(v) &&
  typeof v.excerpt_id === "string" &&
  Number.isInteger(v.excerpt_version) &&
  typeof v.source_label === "string" &&
  typeof v.source_date === "string" &&
  typeof v.period === "string" &&
  typeof v.locator === "string";

/**
 * Narrow to a completed chat payload. Rejects anything that is not exactly `{answer, citations}`
 * with well-formed citations — an export `{download_path}` or a `Review` must not pass.
 */
export function readChatResult(data: Data): ChatResult | null {
  const o: unknown = data;
  if (!isRecord(o)) return null;
  const { answer, citations } = o;
  if (typeof answer !== "string" || answer.length === 0) return null;
  if (!Array.isArray(citations) || !citations.every(isCitation)) return null;
  return { answer, citations: citations as Citation[] };
}
