import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** "highlight" = brand-coloured card (max. one per screen — the most important number/action). */
  variant?: "default" | "highlight";
};

/** White card with a thin border — the basic content container. */
export function Card({ variant = "default", className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card p-6",
        variant === "highlight" ? "bg-brand text-on-brand" : "border border-border bg-surface",
        className,
      )}
      {...rest}
    />
  );
}

type CardHeaderProps = {
  title: string;
  /** Grey caption under the title, e.g. "Track tickets from the last week". */
  description?: string;
  /** Element on the right: filter (Select), button, Badge. */
  actions?: ReactNode;
};

/** Section header inside a card: title + caption on the left, action on the right. */
export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
