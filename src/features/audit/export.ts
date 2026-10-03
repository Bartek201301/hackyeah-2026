/*
 * The audit CSV download.
 *
 * `GET /audit/export` answers with `text/csv` plus an `X-Trace-ID` header on success, and with the
 * ordinary JSON envelope on refusal. The screen must show that export trace identifier and must
 * handle the row cap, so the request is a fetch rather than a plain anchor: an anchor cannot read a
 * response header and cannot tell a CSV from a refusal.
 *
 * Two rules live here because they are the ones that can go wrong silently:
 *  - the row cap is a refusal with a narrowing instruction, never a truncated file
 *  - cell neutralisation of leading `=`, `+`, `-`, `@`, tab and CR is the server's job; this layer
 *    asserts the outcome and never rewrites bytes, because a client that "fixes" a cell would hide a
 *    server that stopped doing it
 */
import type { ReadFailure } from "./envelope";
import { classifyFailure, readError } from "./envelope";
import type { ReportingScope } from "./scope";

/** The contract caps one export at 1000 rows. */
export const EXPORT_ROW_CAP = 1000;

export type ExportState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "done"; traceId: string | null; filename: string }
  | { kind: "overCap"; message: string }
  | ReadFailure;

export function exportPath(scope: ReportingScope): string {
  return `/audit/export?scope=${scope}`;
}

/** `audit-own-2026-10-03.csv`; used when the server sends no filename of its own. */
export function fallbackFilename(scope: ReportingScope, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return `audit-${scope}-${day}.csv`;
}

/**
 * Reads the filename the server asked for. Only a plain quoted or bare token is accepted, and any
 * path separator disqualifies it, so a crafted header cannot steer where a browser writes.
 */
export function parseContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  if (!name) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return name;
}

/**
 * The row cap arrives as `INVALID_INPUT` carrying the narrowing instruction
 * (`Nikodem/fixtures/error-export-row-cap.json`). It is told apart from an ordinary invalid range by
 * the row count in the message, so a range error still reads as a range error.
 */
function isRowCap(message: string): boolean {
  return message.includes(String(EXPORT_ROW_CAP)) || /\brows\b/i.test(message);
}

export function classifyExportResponse(
  status: number,
  contentType: string | null,
  body: unknown,
  headers: { traceId: string | null; contentDisposition: string | null },
  scope: ReportingScope,
  now: Date,
): ExportState {
  const isCsv = (contentType ?? "").toLowerCase().includes("text/csv");

  if (status === 200 && isCsv) {
    return {
      kind: "done",
      traceId: headers.traceId,
      filename: parseContentDisposition(headers.contentDisposition) ?? fallbackFilename(scope, now),
    };
  }

  const error = readError(body);
  if (error && error.code === "INVALID_INPUT" && isRowCap(error.message)) {
    return { kind: "overCap", message: error.message };
  }

  // No payload is expected on an export refusal, so the shared classifier decides the state.
  return classifyFailure(status, body, false) ?? { kind: "clientError" };
}
