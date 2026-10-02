import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  /** Np. przycisk "Dodaj pierwszy element". */
  action?: ReactNode;
  icon?: ReactNode;
};

/** Stan pusty: lista bez elementów, brak wyników wyszukiwania itp. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
