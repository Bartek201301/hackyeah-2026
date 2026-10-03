import { Badge, Card, CardHeader, EmptyState, Notice } from "@/shared/ui";
import type { AssessmentView, StageRow } from "../trace";
import { groupStages } from "../trace";
import { copy } from "../copy";
import { UsageGroups } from "./UsageGroups";

function AssessmentBlock({ assessment }: { assessment: AssessmentView }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{copy.assessment.title}</h4>
        <Badge tone={assessment.statusTone}>{assessment.statusLabel}</Badge>
      </div>
      {assessment.statusHint && <p className="text-xs text-muted">{assessment.statusHint}</p>}
      {assessment.coverageWarning && <Notice tone="danger">{assessment.coverageWarning}</Notice>}
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {assessment.scores.map((score) => (
          <div key={score.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{score.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">{score.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">{copy.assessment.windows}</dt>
          <dd className="text-sm font-semibold tabular-nums text-fg">{assessment.windows}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">{copy.assessment.ranges}</dt>
          <dd className="text-sm font-semibold tabular-nums text-fg">{assessment.ranges}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">{copy.assessment.revision}</dt>
          <dd className="truncate text-sm font-semibold text-fg">{assessment.revision}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">{copy.assessment.hash}</dt>
          <dd className="truncate text-sm font-semibold tabular-nums text-fg">{assessment.hash}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">{copy.assessment.scoreHint}</p>
    </div>
  );
}

function StageItem({ row }: { row: StageRow }) {
  return (
    <li className="flex flex-col gap-4 border-t border-border pt-5 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg">{row.stage}</span>
        <Badge tone={row.isSubcall ? "neutral" : "brand"}>
          {row.isSubcall ? copy.stages.toolSubcall : copy.stages.rootStage}
        </Badge>
        <Badge tone="brand">{row.eventType}</Badge>
        <span className="text-xs tabular-nums text-muted">{row.when}</span>
        {row.elapsed && <span className="text-xs tabular-nums text-muted">{row.elapsed}</span>}
        <Badge tone={row.policyChanged ? "warning" : "neutral"}>
          {`${copy.label.policyVersion} ${row.policyVersion}`}
        </Badge>
        <Badge tone={row.feedChanged ? "warning" : "neutral"}>
          {`${copy.label.feedVersion} ${row.feedVersion}`}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{copy.stages.findings}</h4>
        {row.findings.length === 0 ? (
          <p className="text-sm text-muted">{copy.stages.noFindings}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {row.findings.map((finding) => (
              <li
                key={`${finding.code}-${finding.stage}-${finding.locator}`}
                className="flex flex-wrap items-center gap-2"
              >
                <Badge tone={finding.tone}>{finding.severity}</Badge>
                <span className="text-sm font-semibold text-fg">{finding.code}</span>
                <span className="text-xs text-muted">{finding.category}</span>
                <span className="text-xs text-muted">{finding.locator}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AssessmentBlock assessment={row.assessment} />

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {copy.stages.stageUsage}
        </h4>
        <UsageGroups usage={row.usage} compact />
      </div>
    </li>
  );
}

/**
 * The stored stages in recorded order. Durations stay per stage: the gateway's spans overlap, so a
 * total here would be arithmetic the audit record does not support. A finding shows its code,
 * category, severity and position reference, never a value or a quoted fragment.
 *
 * Tool subcalls are folded into a native disclosure — no shared disclosure block exists — and are
 * labelled as subcalls of the root request above them, so a reader cannot count them as requests.
 */
export function StageList({ rows }: { rows: StageRow[] }) {
  const groups = groupStages(rows);

  return (
    <Card>
      <CardHeader title={copy.stages.title} description={copy.stages.description} />
      {rows.length === 0 ? (
        <EmptyState title={copy.stages.emptyTitle} description={copy.stages.emptyDescription} />
      ) : (
        <ol className="flex flex-col gap-5">
          {groups.map((group) =>
            group.kind === "stage" ? (
              <StageItem key={group.row.key} row={group.row} />
            ) : (
              <li key={group.key} className="border-t border-border pt-5 first:border-0 first:pt-0">
                <details className="flex flex-col gap-4">
                  <summary className="cursor-pointer text-sm font-semibold text-fg">
                    {`${copy.stages.showSubcalls} (${group.rows.length})`}
                  </summary>
                  <p className="mt-2 text-xs text-muted">{copy.stages.subcallHint}</p>
                  <ol className="mt-4 flex flex-col gap-5">
                    {group.rows.map((row) => (
                      <StageItem key={row.key} row={row} />
                    ))}
                  </ol>
                </details>
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  );
}
