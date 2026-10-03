/*
 * ============================================================================
 *  TEAM CONTRACT — shared data types for all features.
 * ============================================================================
 *
 *  Why: three people build in parallel. If each invents their own shape of a
 *  "ticket" or "user", merging branches ends in mismatched types.
 *  This file fixes the data shape ONCE, before anyone starts work.
 *
 *  Rules:
 *  1. The integrator fills it in before dependent implementation, together with the database schema
 *     (supabase/migrations). Field names = database column names (snake_case).
 *  2. After the freeze: ADDITIONS ONLY (new types, new optional fields).
 *     Never a rename, type change or removal. Integrator only, via PR.
 *  3. Keep types private to one feature in src/features/<name>/types.ts, not here.
 * ============================================================================
 */

/* ---------- 1. Helper types (ready, do not change) ---------- */

/** Database row identifier (uuid as text). */
export type Id = string;

/** ISO date/time as returned by Supabase, e.g. "2026-10-03T12:00:00Z". */
export type IsoDateTime = string;

/**
 * Result of every Server Action. An action never throws to the UI —
 * it returns { ok: false, error } with an English message to show the user.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/* ---------- 2. Domain entities (agree before implementation) ---------- */
/*
 * Pattern for one entity (matches a database table):
 *
 *   export type Report = {
 *     id: Id;
 *     created_at: IsoDateTime;
 *     title: string;
 *     status: ReportStatus;
 *   };
 *   export type ReportStatus = "new" | "in_progress" | "done";
 */

/* ---------- 3. Form / action input data (agree before implementation) ---------- */
/*
 * Pattern:  export type NewReport = Pick<Report, "title">;
 */
