import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, AuditProjection } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { toListProjection } from "./auditList";
import { sha256Hex } from "./checks";
import { errorOutcome } from "./envelope";
import { parseScope, parseWindow } from "./metrics";
import type { GatewayDeps, Outcome } from "./ports";

/*
 * audit_export: the audit list of one window as a CSV file.
 *
 * Scope and window follow metrics_read (protocols.md "Dashboard projections"): own by default,
 * organisation for admins only, one UTC day at most. The rows are the AuditProjection list fields,
 * flattened, so the file carries safe codes and measurements only — never events, prompts or text.
 *
 * Unlike audit_list and metrics_read, this hands a file out of the gateway, so the access itself is
 * durable: begin_operation writes an `audit_export` operation and its `intent` event under the
 * X-Trace-ID before any byte is sent. If that write fails the file is withheld (handle maps the
 * GatewayError), so a trace id is never shown for an export that has no record. The event carries
 * the request hash only, never the rows. A refused export reads nothing and records nothing.
 */

/** protocols.md: one export is at most 1,000 rows; a larger window is refused, never truncated. */
export const EXPORT_ROW_CAP = 1000;

const USAGE_FIELDS = [
  "generation_input_tokens",
  "generation_output_tokens",
  "generation_ms",
  "semantic_input_tokens",
  "semantic_ms",
  "reserved_generation_tokens",
  "unresolved_reservation",
  "comparison_micro_usd",
  "comparison_rate_version",
] as const;

const HEADER = [
  "trace_id",
  "created_at",
  "actor_id",
  "operation",
  "state",
  "decision",
  "reasons",
  "policy_version",
  "feed_version",
  ...USAGE_FIELDS,
];

/**
 * One CSV cell. A leading `=`, `+`, `-`, `@`, tab or CR makes a spreadsheet read the cell as a
 * formula, so it is prefixed with `'` (docs/demo/scenarios.md). Quoting then follows RFC 4180.
 */
export function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(items: readonly AuditProjection[]): string {
  const lines = [HEADER.join(",")];
  for (const item of items) {
    const cells = [
      item.trace_id,
      item.created_at,
      item.actor_id,
      item.operation,
      item.state,
      item.decision,
      item.reasons.join(";"),
      item.policy_version,
      item.feed_version,
      ...USAGE_FIELDS.map((field) => item.usage[field]),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export async function exportAudit(
  deps: GatewayDeps,
  actor: ActorContext,
  params: { scope: string | null; from: string | null; to: string | null },
  now: Date = new Date(),
): Promise<Outcome | Response> {
  const scope = parseScope(params.scope);
  if (scope === null) return errorOutcome("INVALID_INPUT");
  if (scope === "organisation" && actor.role !== "admin") return errorOutcome("ACCESS_DENIED");

  const window = parseWindow(params.from, params.to, now);
  if (window === null) {
    return errorOutcome("INVALID_INPUT", { message: "Select a range inside a single UTC day." });
  }

  const rows = await deps.repository.exportActivity({
    organisationId: actor.organisation_id,
    ownActorId: scope === "own" ? actor.actor_id : null,
    from: window.from,
    to: window.to,
    // One past the cap, so exactly the cap still exports and only a larger window refuses.
    limit: EXPORT_ROW_CAP + 1,
  });
  if (rows.length > EXPORT_ROW_CAP) {
    return errorOutcome("INVALID_INPUT", {
      message: "This export exceeds 1000 rows. Narrow the scope or the day and request it again.",
    });
  }

  // Never partial: one row that does not match the contract withholds the whole file.
  const items: AuditProjection[] = [];
  for (const row of rows) {
    const checked = check("AuditProjection", toListProjection(row));
    if (!checked.ok) return errorOutcome("STATE_UNAVAILABLE");
    items.push(checked.value);
  }

  const traceId = randomUUID();
  await deps.repository.beginOperation({
    actor,
    operation: "audit_export",
    // A GET carries no Idempotency-Key; every download is its own access.
    idempotencyKey: randomUUID(),
    requestSha256: sha256Hex(JSON.stringify({ scope, ...window })),
    traceId,
    runId: null,
  });
  return new Response(toCsv(items), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${scope}-${window.from.slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Trace-ID": traceId,
    },
  });
}
