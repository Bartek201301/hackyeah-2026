import type { ReactNode } from "react";
import { cn } from "@/shared/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-fg",
  danger: "bg-danger text-on-brand",
};

/** Pigułka statusu lub zmiany, np. <Badge tone="success">+12,4%</Badge> */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
