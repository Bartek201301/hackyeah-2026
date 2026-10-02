import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

type ErrorStateProps = {
  title?: string;
  /** Komunikat dla użytkownika — po ludzku, bez stack trace. */
  description?: string;
  /** Np. przycisk "Spróbuj ponownie". */
  action?: ReactNode;
};

/** Stan błędu: coś się nie udało, użytkownik widzi co i może spróbować ponownie. */
export function ErrorState({
  title = "Coś poszło nie tak",
  description = "Spróbuj ponownie za chwilę.",
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger-soft px-6 py-12 text-center"
    >
      <TriangleAlert className="size-8 text-danger" aria-hidden />
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
