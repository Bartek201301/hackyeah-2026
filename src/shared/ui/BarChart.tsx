import { cn } from "@/shared/cn";

export type BarDatum = {
  label: string;
  value: number;
  /** Opcjonalna druga seria (szary słupek obok), np. poprzedni okres. */
  compare?: number;
};

type BarChartProps = {
  data: BarDatum[];
  /** Nazwy serii w legendzie. */
  valueLabel?: string;
  compareLabel?: string;
  /** Wysokość obszaru słupków w pikselach. */
  height?: number;
};

/** Prosty wykres słupkowy bez bibliotek: niebieskie słupki + opcjonalne szare do porównania. Dymek po najechaniu. */
export function BarChart({
  data,
  valueLabel = "Wartość",
  compareLabel = "Porównanie",
  height = 200,
}: BarChartProps) {
  const hasCompare = data.some((d) => d.compare !== undefined);
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.compare ?? 0]));
  const fmt = (n: number) => n.toLocaleString("pl-PL");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-xs text-muted">
        {hasCompare && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-border" aria-hidden /> {compareLabel}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand" aria-hidden /> {valueLabel}
        </span>
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center gap-1">
            {hasCompare && (
              <div
                className="w-full max-w-4 rounded-full bg-border transition-colors group-hover:bg-muted/40"
                style={{ height: `${((d.compare ?? 0) / max) * 100}%` }}
              />
            )}
            <div
              className={cn(
                "w-full rounded-full bg-brand transition-colors group-hover:bg-brand-hover",
                hasCompare && "max-w-4",
              )}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full z-10 mb-2 hidden flex-col gap-1 whitespace-nowrap rounded-control bg-ink px-3 py-2 text-xs text-on-ink shadow-card group-hover:flex"
            >
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand" aria-hidden /> {fmt(d.value)} {valueLabel}
              </span>
              {hasCompare && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-on-ink" aria-hidden /> {fmt(d.compare ?? 0)}{" "}
                  {compareLabel}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-4">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
