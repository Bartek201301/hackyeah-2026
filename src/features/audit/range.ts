/*
 * The reporting window, parsed from the URL.
 *
 * The contract confines a range to one UTC day (`docs/contracts/protocols.md:120`), so the screen
 * never sends a range it would have to defend: it sends the bounds of exactly one day, derived here.
 * Parsing is strict, and an unreadable or impossible day falls back to the current UTC day rather
 * than to a wider window.
 *
 * `GET /audit` takes no range parameter — only `after` — so the day governs the metrics and the
 * export, and the activity list is whatever the cursor reaches. The copy says so rather than
 * implying the list is filtered.
 */

/** `YYYY-MM-DD` in UTC. */
export type UtcDay = string;

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc(now: Date): UtcDay {
  return now.toISOString().slice(0, 10);
}

/** True only for a day that exists: `2026-02-30` is rejected, not silently shifted. */
export function isUtcDay(value: unknown): value is UtcDay {
  if (typeof value !== "string" || !DAY_SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseDay(value: string | string[] | undefined, now: Date): UtcDay {
  return isUtcDay(value) ? value : todayUtc(now);
}

/** The inclusive bounds of one UTC day, in the format the contract asks for. */
export function dayBounds(day: UtcDay): { from: string; to: string } {
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

export function shiftDay(day: UtcDay, deltaDays: number): UtcDay {
  const moved = new Date(`${day}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + deltaDays);
  return moved.toISOString().slice(0, 10);
}

/**
 * Guards the window a response reports back. A server that widened the range beyond one day would be
 * outside the contract, and a screen that displayed it anyway would be vouching for it.
 */
export function isSingleUtcDay(from: string, to: string): boolean {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() < start.getTime()) return false;
  return start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
}
