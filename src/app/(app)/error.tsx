"use client";

import { useEffect } from "react";
import { Button, ErrorState } from "@/shared/ui";

/* Catches errors from every page of the app. Error details are in the browser console and terminal. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      description={error.message || "Unexpected error."}
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
