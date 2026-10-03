import "server-only";
import { parse } from "csv-parse/sync";
import type { GatewayPolicy } from "@/shared/contracts";

// The import row schema (docs/demo/scenarios.md "CSV upload schema"), shared by connector batch rows and
// uploaded CSV files: exactly these six fields, in this order for a CSV header.

export const FIELDS = ["text", "source_date", "period", "unit", "fact_key", "basis"] as const;
const BASES = new Set(["actual", "forecast", "proposal", "event"]);

export type Row = Record<(typeof FIELDS)[number], string>;
export type NumberedRow = { n: number; row: Row };

const isDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d);

/** The row schema: exactly the six fields, non-empty strings, an ISO date, a known basis, bounded text. */
export function validRow(payload: unknown, maxChars: number): payload is Row {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  if (Object.keys(p).length !== FIELDS.length) return false;
  if (!FIELDS.every((f) => typeof p[f] === "string" && p[f].trim() !== "")) return false;
  const r = p as Row;
  return (
    isDate(r.source_date) &&
    BASES.has(r.basis) &&
    // Metadata is published beside the text but never semantically assessed, so it is held to short
    // closed shapes that cannot carry a sentence (FY2025 / 2026-Q4, USD million, bid_ceiling).
    /^[A-Za-z0-9-]{1,20}$/.test(r.period) &&
    /^[A-Za-z%$]{1,12}( [A-Za-z]{1,12})?$/.test(r.unit) &&
    /^[a-z0-9_]{1,40}$/.test(r.fact_key) &&
    [...r.text].length <= maxChars
  );
}

/**
 * Strict CSV: the exact header, fixed column count, quoted newlines kept, every row valid, at most
 * `max_csv_rows` data rows. Any violation fails the whole file with a locator, never a partial result.
 */
export function parseCsv(
  text: string,
  limits: Pick<GatewayPolicy["imports"], "max_csv_rows" | "max_text_chars">,
): { rows: NumberedRow[] } | { locator: string } {
  let records: string[][];
  try {
    // Every field stays a string; a record with a different column count throws.
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      relax_quotes: false,
    });
  } catch (e) {
    const line = (e as { lines?: unknown }).lines;
    return { locator: typeof line === "number" ? `line:${line}` : "file" };
  }
  const [header, ...data] = records;
  if (!header || header.length !== FIELDS.length || FIELDS.some((f, i) => header[i] !== f))
    return { locator: "header" };
  if (data.length === 0) return { locator: "file" };
  if (data.length > limits.max_csv_rows) return { locator: `row:${limits.max_csv_rows + 1}` };
  const rows: NumberedRow[] = [];
  for (const [i, record] of data.entries()) {
    const row = Object.fromEntries(FIELDS.map((f, j) => [f, record[j]]));
    if (!validRow(row, limits.max_text_chars)) return { locator: `row:${i + 1}` };
    rows.push({ n: i + 1, row });
  }
  return { rows };
}
