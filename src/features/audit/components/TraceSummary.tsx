import { Badge, Card, CardHeader, Notice } from "@/shared/ui";
import type { AuditProjection } from "@/shared/contracts";
import { copy } from "../copy";
import { formatTimestampUtc, shortId } from "../format";
import { decisionBadge, usageView } from "../trace";
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
 * beyond the stored safe reason codes. The counter is labelled a root request, so it is never
 * read as a sum of the stage events below it.
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
        <CardHeader
          title={trace.operation}
          description={`${copy.label.rootRequest} · ${formatTimestampUtc(trace.created_at)}`}
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
            <ul className="flex flex-wrap gap-2">
              {trace.reasons.map((reason) => (
                <li key={reason}>
                  <Badge tone={badge.tone === "danger" ? "danger" : "neutral"}>{reason}</Badge>
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
