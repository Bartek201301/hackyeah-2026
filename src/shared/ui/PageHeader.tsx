import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Przyciski po prawej stronie nagłówka. */
  actions?: ReactNode;
};

/** Nagłówek każdego ekranu. Każda strona zaczyna się od niego. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
