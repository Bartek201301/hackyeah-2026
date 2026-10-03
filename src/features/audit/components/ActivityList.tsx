import Link from "next/link";
import { FileClock } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, IconTile, Notice } from "@/shared/ui";
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
            className="truncate rounded-control text-sm font-semibold text-fg underline decoration-border hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

type ActivityListProps = {
  rows: ActivityRow[];
  /** A full page means more may exist; the response carries no explicit next-page field. */
  moreMayExist: boolean;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  olderFailed?: boolean;
};

/**
 * Audited operations, newest first. The footer states that a full page is the 100 most recent
 * records rather than the whole history, and the control asks for the next page by cursor.
 *
 * A failed older page never discards the rows already on screen: it says what failed and leaves the
 * evidence in place, because losing visible records to a network error would look like losing audit
 * data. The list is not filtered by day — `GET /audit` has no range parameter — and the empty copy
 * says so instead of inviting the reader to pick another day.
 */
export function ActivityList({
  rows,
  moreMayExist,
  onLoadOlder,
  loadingOlder = false,
  olderFailed = false,
}: ActivityListProps) {
  return (
    <Card>
      <CardHeader title={copy.activity.title} description={copy.activity.description} />
      {/*
       * Said out loud, because the day selector sits directly above this card: a reader would
       * otherwise assume these rows belong to the selected day. `GET /audit` has no range parameter.
       */}
      <p className="mb-5 text-xs text-muted">{copy.range.listNote}</p>
      {rows.length === 0 ? (
        <EmptyState title={copy.activity.emptyTitle} description={copy.activity.emptyDescription} />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <Row key={row.traceId} row={row} />
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2">
            {moreMayExist && <p className="text-xs text-muted">{copy.activity.pageCap}</p>}
            {onLoadOlder && moreMayExist && (
              <div>
                <Button variant="secondary" size="sm" onClick={onLoadOlder} loading={loadingOlder}>
                  {loadingOlder ? copy.activity.loadingOlder : copy.activity.loadOlder}
                </Button>
              </div>
            )}
            {olderFailed && <Notice tone="danger">{copy.activity.olderFailed}</Notice>}
          </div>
        </>
      )}
    </Card>
  );
}
