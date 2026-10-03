"use client";

import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/shared/ui";
import { submitExample } from "../actions";

/* Client form: sends data to the Server Action and shows the submitting state, success or error. */
export function ExampleForm() {
  const [result, formAction, pending] = useActionState(submitExample, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Name"
        hint="At least 2 characters."
        error={result && !result.ok ? result.error : undefined}
      >
        <Input name="name" placeholder="Type something…" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Submit
        </Button>
      </div>
      {result?.ok && <Notice tone="success">Saved: {result.data.name}</Notice>}
    </form>
  );
}
