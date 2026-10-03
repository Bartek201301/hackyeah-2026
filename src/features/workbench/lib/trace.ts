/*
 * Link to the audited trace for a decision.
 *
 * Trace presentation belongs to the audit feature, and `scripts/check-rules.mjs` forbids importing
 * another feature, so the path is a documented string rather than a shared constant. It is taken
 * from the audit route (`src/app/audit/page.tsx`) and that feature's stated contract: one route,
 * view chosen by `?trace=<trace_id>`.
 *
 * Requested as a shared constant in Julian/plans/02-open-questions.md so this duplication does not
 * outlive the demo.
 */

const AUDIT_PATH = "/audit";

/** The envelope's trace_id is a UUID; refuse to build a link from anything else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTraceId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Href for a trace, or null when there is nothing safe to link to.
 *
 * A null trace id is normal: docs/product/technical-spec.md §9 says a trace id may be ephemeral
 * when the audit write itself failed, and the UI must then say the record is unavailable rather
 * than offer a dead link.
 */
export function traceHref(traceId: string | null | undefined): string | null {
  return isTraceId(traceId) ? `${AUDIT_PATH}?trace=${encodeURIComponent(traceId)}` : null;
}
