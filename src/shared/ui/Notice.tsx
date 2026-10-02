import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/shared/cn";

type NoticeTone = "info" | "success" | "danger";

const styles: Record<NoticeTone, string> = {
  info: "bg-brand-soft text-fg border-brand/20",
  success: "bg-success-soft text-fg border-success/30",
  danger: "bg-danger-soft text-fg border-danger/30",
};

const icons: Record<NoticeTone, ReactNode> = {
  info: <Info className="size-4 shrink-0 text-brand" aria-hidden />,
  success: <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />,
  danger: <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />,
};

/** Komunikat w treści strony, np. wynik wysłania formularza. */
export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-control border px-3 py-2 text-sm", styles[tone])}
    >
      {icons[tone]}
      <div>{children}</div>
    </div>
  );
}
