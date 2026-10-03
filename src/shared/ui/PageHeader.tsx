import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Buttons on the right side of the header. */
  actions?: ReactNode;
};

/** Header of every screen. Every page starts with it. */
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
