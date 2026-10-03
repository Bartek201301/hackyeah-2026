import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/cn";

type IconTileProps = {
  icon: LucideIcon;
  /** "onBrand" = white tile on a highlight card. */
  tone?: "neutral" | "brand" | "onBrand";
  className?: string;
};

const tones = {
  neutral: "bg-surface text-fg border border-border",
  brand: "bg-brand-soft text-fg",
  onBrand: "bg-on-brand/10 text-on-brand",
};

/** Icon in a rounded square — in the corner of a stat card, next to a list item. */
export function IconTile({ icon: Icon, tone = "neutral", className }: IconTileProps) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-control",
        tones[tone],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
