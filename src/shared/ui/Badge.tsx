import type { ReactNode } from "react";
import { cn } from "@/shared/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-surface-muted text-fg",
  brand: "border-border bg-brand-soft text-fg",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-fg",
  danger: "border-danger bg-danger text-on-brand",
};

/** Status or change pill, e.g. <Badge tone="success">+12.4%</Badge> */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
