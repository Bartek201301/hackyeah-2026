/*
 * Value formatting for the audit screens. Pure functions on purpose: this is the only layer
 * the current test runner can reach (vitest collects `*.test.ts` files under src in a node
 * environment), so no number may be formatted inside a component.
 *
 * Grouping is implemented here rather than through toLocaleString so that output does not
 * depend on the host locale. DESIGN.md requires English formatting; the shared BarChart
 * hardcodes pl-PL, which is why this feature formats its own numbers.
 */
import { copy } from "./copy";

/** Thousands separators for an integer: 1842 -> "1,842". */
export function group(value: number): string {
  const rounded = Math.trunc(value);
  const sign = rounded < 0 ? "-" : "";
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

const pad = (value: number, width = 2) => value.toString().padStart(width, "0");

/** `YYYY-MM-DD HH:MM:SS UTC`. The zone suffix is explicit so a reader cannot assume local time. */
export function formatTimestampUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return copy.label.unknown;
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

/** `812 ms` below a second, `7.1 s` above it. `null` is unknown, never 0. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return copy.label.notMeasured;
  if (ms < 1000) return `${group(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Elapsed time between two stage timestamps, or null when it cannot be computed. */
export function formatElapsed(previousIso: string, iso: string): string | null {
  const from = new Date(previousIso).getTime();
  const to = new Date(iso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return `+${formatDuration(to - from)}`;
}

export function formatTokens(value: number | null): string {
  if (value === null) return copy.label.notMeasured;
  return `${group(value)} tokens`;
}

export function formatCount(value: number | null): string {
  if (value === null) return copy.label.notMeasured;
  return group(value);
}

/** Two decimals in 0.00–1.00. A null score is unmeasured, which is not a low score. */
export function formatScore(value: number | null): string {
  if (value === null) return copy.label.notMeasured;
  return value.toFixed(2);
}

export function formatRatio(completed: number, planned: number): string {
  return `${group(completed)} / ${group(planned)}`;
}

/** First 8 and last 4 characters; the full value stays available through a title attribute. */
export function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatHash(sha256: string | null): string {
  if (!sha256) return copy.label.noHash;
  return `${sha256.slice(0, 12)}…`;
}

export function formatRevision(revision: string | null): string {
  return revision ?? copy.label.noRevision;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards the request: a malformed identifier is answered locally, without calling the gateway. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
