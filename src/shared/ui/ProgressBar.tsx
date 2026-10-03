import { cn } from "@/shared/cn";

type ProgressBarProps = {
  /** 0–100 */
  value: number;
  label?: string;
  /** Tekst po prawej, np. "2 417" albo "68%". */
  valueLabel?: string;
  tone?: "brand" | "success" | "danger";
};

const tones = { brand: "bg-brand", success: "bg-success", danger: "bg-danger" };

/** Cienki pasek postępu/udziału z etykietą — np. rozkład na kategorie, postęp zadania. */
export function ProgressBar({ value, label, valueLabel, tone = "brand" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1.5">
      {(label || valueLabel) && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-fg">{label}</span>
          <span className="font-semibold tabular-nums text-fg">{valueLabel}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
