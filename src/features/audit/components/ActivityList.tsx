import Link from "next/link";
import { FileClock } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, IconTile } from "@/shared/ui";
import type { ActivityRow } from "../activity";
import { copy } from "../copy";

function Row({ row }: { row: ActivityRow }) {
  return (
    <li className="flex items-start gap-3 border-t border-border pt-4 first:border-0 first:pt-0">
      <IconTile icon={FileClock} tone="brand" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/audit?trace=${row.traceId}`}
            title={row.traceId}
            aria-label={`${copy.activity.openTrace} ${row.traceId}`}
            className="truncate text-sm font-semibold text-fg underline decoration-border hover:decoration-brand"
          >
            {row.operation}
          </Link>
          <span className="font-mono text-xs text-muted">{row.traceIdShort}</span>
          {row.actorIdShort && <span className="font-mono text-xs text-muted">{row.actorIdShort}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="tabular-nums">{row.when}</span>
          <span>{row.state}</span>
          <span className="tabular-nums">
            {copy.activity.tokens}: {row.tokens}
          </span>
          <span className="tabular-nums">{`v${row.policyVersion} / v${row.feedVersion}`}</span>
        </div>
        {(row.inlineReasons.length > 0 || row.unresolvedReservation) && (
          <ul className="flex flex-wrap gap-1.5">
            {row.inlineReasons.map((reason) => (
              <li key={reason}>
                <Badge tone={row.decisionTone === "danger" ? "danger" : "neutral"}>{reason}</Badge>
              </li>
            ))}
            {row.hiddenReasons > 0 && (
              <li>
                <Badge tone="neutral">{`+${row.hiddenReasons}`}</Badge>
              </li>
            )}
            {row.unresolvedReservation && (
              <li>
                <Badge tone="warning">{copy.usage.unresolved}</Badge>
              </li>
            )}
          </ul>
        )}
      </div>
      <Badge tone={row.decisionTone}>{row.decisionLabel}</Badge>
    </li>
  );
}

/**
 * One page of audited operations, newest first. The footer states that a full page is the 100
 * most recent records rather than the whole history, because the response carries no next-page
 * field and the list must not imply completeness.
 */
export function ActivityList({ rows, pageCapped }: { rows: ActivityRow[]; pageCapped: boolean }) {
  return (
    <Card>
      <CardHeader title={copy.activity.title} description={copy.activity.description} />
      {rows.length === 0 ? (
        <EmptyState title={copy.activity.emptyTitle} description={copy.activity.emptyDescription} />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <Row key={row.traceId} row={row} />
            ))}
          </ul>
          {pageCapped && <p className="mt-5 text-xs text-muted">{copy.activity.pageCap}</p>}
        </>
      )}
    </Card>
  );
}
