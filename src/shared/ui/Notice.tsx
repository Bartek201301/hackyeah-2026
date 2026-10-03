import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/shared/cn";

type NoticeTone = "info" | "success" | "danger";

const styles: Record<NoticeTone, string> = {
  info: "bg-surface-muted text-fg border-border",
  success: "bg-success-soft text-fg border-success/25",
  danger: "bg-danger-soft text-fg border-danger/25",
};

const icons: Record<NoticeTone, ReactNode> = {
  info: <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />,
  success: <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />,
  danger: <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />,
};

/** Inline page message, e.g. the result of submitting a form. */
export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-control border px-4 py-3 text-sm", styles[tone])}
    >
      {icons[tone]}
      <div>{children}</div>
    </div>
  );
}
