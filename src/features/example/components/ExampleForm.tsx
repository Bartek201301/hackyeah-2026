"use client";

import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { submitExample } from "../actions";

/* Formularz kliencki: wysyła dane do Server Action i pokazuje stan wysyłania, sukces albo błąd. */
export function ExampleForm() {
  const [result, formAction, pending] = useActionState(submitExample, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Nazwa"
        hint="Co najmniej 2 znaki."
        error={result && !result.ok ? result.error : undefined}
      >
        <Input name="name" placeholder="Wpisz coś…" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Wyślij
        </Button>
      </div>
      {result?.ok && <Notice tone="success">Zapisano: {result.data.name}</Notice>}
    </form>
  );
}
