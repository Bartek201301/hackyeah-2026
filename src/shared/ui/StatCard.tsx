import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/cn";
import { Card } from "./Card";
import { IconTile } from "./IconTile";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  /** Główna liczba — już sformatowana, np. "34 760" albo "612 917 zł". */
  value: string;
  /** Szary dopisek obok liczby, np. "vs poprzedni miesiąc". */
  hint?: string;
  /** Zmiana w pigułce, np. "+12,4%". Kolor wynika z `trend`. */
  change?: string;
  trend?: "up" | "down";
  /** Karta w kolorze marki — tylko dla JEDNEJ najważniejszej liczby na ekranie. */
  highlight?: boolean;
};

/** Kafelek z kluczową liczbą: ikona + zmiana u góry, etykieta i duża liczba na dole. */
export function StatCard({
  icon,
  label,
  value,
  hint,
  change,
  trend = "up",
  highlight = false,
}: StatCardProps) {
  return (
    <Card variant={highlight ? "highlight" : "default"} className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={icon} tone={highlight ? "onBrand" : "neutral"} />
        {change && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
              trend === "down" ? "bg-danger text-on-brand" : "bg-success-soft text-success",
            )}
          >
            {change}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn("text-sm font-medium", highlight ? "text-on-brand/80" : "text-muted")}>
          {label}
        </span>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
          {hint && (
            <span
              className={cn(
                "max-w-32 pb-1 text-xs leading-tight",
                highlight ? "text-on-brand/70" : "text-muted",
              )}
            >
              {hint}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
