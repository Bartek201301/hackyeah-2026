import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/cn";

type IconTileProps = {
  icon: LucideIcon;
  /** "onBrand" = biały kafelek na karcie highlight. */
  tone?: "neutral" | "brand" | "onBrand";
  className?: string;
};

const tones = {
  neutral: "bg-surface-muted text-fg border border-border",
  brand: "bg-brand-soft text-brand",
  onBrand: "bg-surface text-brand",
};

/** Ikona w zaokrąglonym kwadracie — w rogu karty statystyki, przy pozycji listy. */
export function IconTile({ icon: Icon, tone = "neutral", className }: IconTileProps) {
  return (
    <span
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-control",
        tones[tone],
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
