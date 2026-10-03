import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  /** E.g. an "Add the first item" button. */
  action?: ReactNode;
  icon?: ReactNode;
};

/** Empty state: a list with no items, no search results, etc. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted ring-8 ring-surface-muted/50">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
