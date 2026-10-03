import { Activity, ClipboardList, FlaskConical, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge, Card, CardHeader, StatCard } from "@/shared/ui";
import type { MetricsView } from "../metrics";
import { copy } from "../copy";
import { shortId } from "../format";
import { UsageGroups } from "./UsageGroups";

const icons = [Activity, ShieldAlert, RotateCcw, ClipboardList, FlaskConical];

/**
 * Security decisions. Five counters, five questions: the group never collapses them into one
 * "incidents" number, and the captions below the cards carry the two statements that keep the
 * figures honest — a refusal is not a breach, and a root request is not a subcall.
 */
export function ControlsPanel({ view }: { view: MetricsView }) {
  const captions = view.controls.filter((card) => card.hint !== null);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="audit-controls">
      <h2 id="audit-controls" className="text-sm font-semibold uppercase tracking-wider text-muted">
        {copy.metrics.controlsTitle}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {view.controls.map((card, index) => (
          <StatCard
            key={card.label}
            icon={icons[index] ?? Activity}
            label={card.label}
            value={card.value}
            highlight={card.label === copy.metrics.blockedAttempts}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {captions.map((card) => (
          <li key={card.label} className="text-xs text-muted">
            <span className="font-semibold">{card.label}:</span> {card.hint}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Resource use, given the same weight as the decisions beside it. Measured use, the reservation
 * and the unknowns stay in their three groups; the illustrative figure never appears without its
 * rate version and disclaimer; and an estimate without a traceable baseline is withheld.
 */
export function ResourcesPanel({ view }: { view: MetricsView }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="audit-resources">
      <h2 id="audit-resources" className="text-sm font-semibold uppercase tracking-wider text-muted">
        {copy.metrics.resourcesTitle}
      </h2>

      <Card>
        <CardHeader title={copy.metrics.measuredUse} description={copy.disclaimer.overhead} />
        <UsageGroups usage={view.usage} />
      </Card>

      <Card>
        <CardHeader
          title={copy.metrics.estimatesTitle}
          actions={<Badge tone="neutral">{copy.metrics.estimatedBadge}</Badge>}
        />
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">{copy.metrics.illustrativeCost}</span>
            <span className="text-lg font-semibold tabular-nums text-fg">{view.money.value}</span>
          </div>
          <p className="text-xs text-muted">
            {view.money.disclaimer} Rate version {view.money.rateVersion}.
          </p>

          <dl className="flex flex-col gap-1.5">
            {view.estimates.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>

          {view.reductionSourceTraceId ? (
            <p className="text-xs text-muted">
              {copy.disclaimer.estimate} {copy.metrics.reductionSource}{" "}
              <a
                className="font-semibold text-brand underline"
                href={`/audit?trace=${view.reductionSourceTraceId}`}
                title={view.reductionSourceTraceId}
              >
                {shortId(view.reductionSourceTraceId)}
              </a>
            </p>
          ) : (
            <p className="text-xs text-muted">{copy.disclaimer.noBaseline}</p>
          )}
        </div>
      </Card>
    </section>
  );
}

/** The window the figures describe, echoed from the response rather than from local state. */
export function ScopeLine({ view }: { view: MetricsView }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <Badge tone="brand">{view.scope}</Badge>
      <span className="tabular-nums">
        {copy.metrics.rangeLabel}: {view.rangeFrom} → {view.rangeTo}
      </span>
    </div>
  );
}
