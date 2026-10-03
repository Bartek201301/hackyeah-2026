import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

type ErrorStateProps = {
  title?: string;
  /** Message for the user — plain language, no stack trace. */
  description?: string;
  /** E.g. a "Try again" button. */
  action?: ReactNode;
};

/** Error state: something failed; the user sees what and can try again. */
export function ErrorState({
  title = "Something went wrong",
  description = "Try again in a moment.",
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/25 bg-danger-soft px-6 py-10 text-center"
    >
      <TriangleAlert className="size-6 text-danger" aria-hidden />
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
