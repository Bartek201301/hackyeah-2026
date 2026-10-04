import Link from "next/link";
import { Badge, Notice } from "@/shared/ui";
import type { ActNoticeView } from "../lib/actFlow";
import { traceHref } from "../lib/trace";

/* Presentational only: the Act-mode result. Decisions and wording live in lib/actFlow.ts. */

const link =
  "font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const BADGE = { ALLOW: "success", REVIEW: "warning", BLOCK: "danger" } as const;

export function ActNotice({
  view,
  reasons,
  traceId,
  clientTraceId,
}: {
  view: ActNoticeView;
  reasons: readonly string[];
  traceId: string | null;
  clientTraceId: string | null;
}) {
  const runHref = traceHref(traceId);
  const clientHref = traceHref(clientTraceId);
  // Shared Notice has no amber tone: REVIEW reads as a status with an amber badge beside its label.
  const tone = view.decision === "ALLOW" ? "success" : view.decision === "REVIEW" ? "info" : "danger";

  return (
    <Notice tone={tone}>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Badge tone={BADGE[view.decision]}>{view.decision}</Badge>
          {view.title}
        </p>
        <p>{view.detail}</p>
        {reasons.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Reasons:</span>
            {reasons.map((reason) => (
              <Badge key={reason} tone="neutral">
                {reason}
              </Badge>
            ))}
          </p>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {runHref ? (
            <Link href={runHref} className={link}>
              View the audited trace
            </Link>
          ) : (
            <span className="text-muted">No audit record is available for this attempt.</span>
          )}
          {clientHref && (
            <Link href={clientHref} className={link}>
              View the client action trace
            </Link>
          )}
          {view.decision === "ALLOW" && (
            <Link href="/clients" className={link}>
              Open Clients
            </Link>
          )}
        </p>
      </div>
    </Notice>
  );
}
