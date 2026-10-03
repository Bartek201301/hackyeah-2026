import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** "highlight" = brand-coloured card (max. one per screen — the most important number/action). */
  variant?: "default" | "highlight";
};

/** White, heavily rounded borderless card floating above the background — the basic content container. */
export function Card({ variant = "default", className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card p-6",
        variant === "highlight"
          ? "bg-linear-to-br from-brand to-brand-strong text-on-brand shadow-brand"
          : "border border-surface bg-surface shadow-card",
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
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
