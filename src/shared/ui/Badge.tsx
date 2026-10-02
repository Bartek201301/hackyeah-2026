import type { ReactNode } from "react";
import { cn } from "@/shared/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-bg text-muted border-border",
  brand: "bg-brand-soft text-brand border-brand/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-fg border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/20",
};

/** Mała etykieta statusu, np. <Badge tone="success">Gotowe</Badge> */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
