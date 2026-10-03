import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/cn";
import { Card } from "./Card";
import { IconTile } from "./IconTile";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  /** Main number — already formatted, e.g. "34,760" or "612,917". */
  value: string;
  /** Grey note next to the number, e.g. "vs last month". */
  hint?: string;
  /** Change shown in a pill, e.g. "+12.4%". Colour follows `trend`. */
  change?: string;
  trend?: "up" | "down";
  /** Brand-coloured card — only for the ONE most important number on the screen. */
  highlight?: boolean;
};

/** Tile with a key number: icon + change at the top, label and large number at the bottom. */
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
    <Card variant={highlight ? "highlight" : "default"} className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={icon} tone={highlight ? "onBrand" : "neutral"} />
        {change && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
              trend === "down"
                ? "border-danger bg-danger text-on-brand"
                : "border-success/25 bg-success-soft text-success",
            )}
          >
            {change}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn("text-sm font-medium", highlight ? "text-on-brand/85" : "text-muted")}>
          {label}
        </span>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          {hint && (
            <span
              className={cn(
                "max-w-32 pb-1 text-xs leading-tight",
                highlight ? "text-on-brand/85" : "text-muted",
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
