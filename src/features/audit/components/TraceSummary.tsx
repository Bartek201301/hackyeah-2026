import { Badge, Card, CardHeader, Notice } from "@/shared/ui";
import type { AuditProjection } from "@/shared/contracts";
import { describeOperation } from "@/shared/reasons";
import { reasonViews } from "../activity";
import { copy } from "../copy";
import { formatTimestampUtc, shortId } from "../format";
import { decisionBadge, usageView, whatHappened } from "../trace";
import { UsageGroups } from "./UsageGroups";

type Props = {
  trace: AuditProjection;
  incomplete: boolean;
  cancelled: boolean;
  eventsCapped: boolean;
  serverMessage: string | null;
};

function Pair({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="truncate text-sm font-semibold text-fg" title={title}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Identity, decision and measured use for one audited operation.
 *
 * What is absent is deliberate: no prompt, no excerpt, no document title and no reason text
 * beyond the stored safe reason codes and their fixed plain-language labels. The auditor sees both:
 * the label to read, and the raw code under it as the evidence. The counter is labelled a root
 * request, so it is never read as a sum of the stage events below it.
 */
export function TraceSummary({ trace, incomplete, cancelled, eventsCapped, serverMessage }: Props) {
  const badge = decisionBadge(trace.decision, trace.state);
  const usage = usageView(trace.usage);

  return (
    <div className="flex flex-col gap-6">
      {incomplete && (
        <Notice tone="danger">
          <strong className="font-semibold">{copy.state.incompleteTitle}</strong> {copy.state.incompleteBody}
        </Notice>
      )}
      {cancelled && (
        <Notice tone="info">
          <strong className="font-semibold">{copy.state.cancelledTitle}</strong> {copy.state.cancelledBody}
        </Notice>
      )}
      {eventsCapped && (
        <Notice tone="info">
          <strong className="font-semibold">{copy.state.eventCapTitle}</strong>{" "}
          {serverMessage ?? copy.state.eventCapBody}
        </Notice>
      )}

      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{copy.summary.title}</h2>
        <p className="mt-1 text-base text-fg">{whatHappened(trace)}</p>
      </Card>

      <Card>
        <CardHeader
          title={describeOperation(trace.operation)}
          // Named rather than bare: in a real record this is the projection's own timestamp and
          // matched the LAST stored event, not the start of the operation. An unlabelled time
          // beside "root request" reads as when the request happened, which it is not.
          description={`${copy.label.rootRequest} · ${copy.label.recordedAt} ${formatTimestampUtc(trace.created_at)}`}
          actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
        />
        {badge.hint && <p className="mb-5 text-sm text-muted">{badge.hint}</p>}
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Pair label={copy.label.traceId} value={shortId(trace.trace_id)} title={trace.trace_id} />
          <Pair label={copy.label.actorId} value={shortId(trace.actor_id)} title={trace.actor_id} />
          <Pair label={copy.label.state} value={trace.state} />
          <Pair label={copy.label.policyVersion} value={String(trace.policy_version)} />
          <Pair label={copy.label.feedVersion} value={String(trace.feed_version)} />
        </dl>
        {trace.reasons.length > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {copy.label.reasons}
            </h3>
            <ul className="flex flex-col gap-2">
              {reasonViews(trace.reasons).map((reason) => (
                <li key={reason.code} title={reason.code} className="flex flex-col items-start gap-0.5">
                  <Badge tone={reason.tone}>{reason.label}</Badge>
                  {/* An unknown code is already its own label, so it is not printed twice. */}
                  {reason.label !== reason.code && (
                    <code className="break-all font-mono text-xs text-muted">{reason.code}</code>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={copy.usage.title} description={copy.disclaimer.overhead} />
        <UsageGroups usage={usage} />
      </Card>
    </div>
  );
}
