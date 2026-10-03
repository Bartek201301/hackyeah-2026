import { Badge } from "@/shared/ui";
import type { UsageView, ValueRow } from "../trace";
import { copy } from "../copy";

function Group({ title, rows, hint }: { title: string; rows: ValueRow[]; hint?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <dl className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Actual, reserved and unknown stay in three separate groups, in that order, and are never
 * added together. A reservation sits beside measured use, not inside it, and an unknown value
 * says so in words rather than showing a zero.
 */
export function UsageGroups({ usage, compact = false }: { usage: UsageView; compact?: boolean }) {
  return (
    <div className={compact ? "grid gap-4 sm:grid-cols-3" : "grid gap-6 sm:grid-cols-3"}>
      <Group title={copy.label.actual} rows={usage.actual} />
      <Group
        title={copy.label.reserved}
        rows={usage.reserved}
        hint={compact ? undefined : copy.usage.reservedHint}
      />
      <Group
        title={copy.label.unknownColumn}
        rows={usage.unknown}
        hint={compact ? undefined : copy.usage.unknownHint}
      />
      {usage.unresolvedReservation && (
        <div className="sm:col-span-3">
          <Badge tone="warning">{copy.usage.unresolved}</Badge>
        </div>
      )}
    </div>
  );
}
