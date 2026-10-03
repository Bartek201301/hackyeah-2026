import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** "highlight" = karta w kolorze marki (max. jedna na ekran — najważniejsza liczba/akcja). */
  variant?: "default" | "highlight";
};

/** Biała, mocno zaokrąglona karta bez ramki, unosząca się nad tłem — podstawowy kontener treści. */
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
  /** Szary podpis pod tytułem, np. "Śledź zgłoszenia z ostatniego tygodnia". */
  description?: string;
  /** Element po prawej: filtr (Select), przycisk, Badge. */
  actions?: ReactNode;
};

/** Nagłówek sekcji wewnątrz karty: tytuł + podpis po lewej, akcja po prawej. */
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
