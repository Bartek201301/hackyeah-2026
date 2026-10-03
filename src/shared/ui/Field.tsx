import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/cn";

const control =
  "w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-muted " +
  "focus:border-fg focus:outline-hidden focus:ring-3 focus:ring-fg/10 disabled:cursor-not-allowed disabled:opacity-50";

type FieldProps = {
  label: string;
  /** Hint below the field. */
  hint?: string;
  /** Validation error message — highlights the field in red. */
  error?: string;
  children: ReactNode;
};

/** Label + field + hint/error. Pass the field as a child: <Field label="Title"><Input name="title" /></Field> */
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
