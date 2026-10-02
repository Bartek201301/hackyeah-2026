import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/cn";

const control =
  "w-full rounded-control border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted " +
  "focus:border-brand focus:outline-2 focus:outline-brand-soft disabled:opacity-60";

type FieldProps = {
  label: string;
  /** Podpowiedź pod polem. */
  hint?: string;
  /** Komunikat błędu walidacji — podświetla pole na czerwono. */
  error?: string;
  children: ReactNode;
};

/** Etykieta + pole + podpowiedź/błąd. Pole przekaż jako dziecko: <Field label="Tytuł"><Input name="title" /></Field> */
export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {error ? (
        <span className="text-sm text-danger">{error}</span>
      ) : (
        hint && <span className="text-sm text-muted">{hint}</span>
      )}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10", className)} {...rest} />;
}
