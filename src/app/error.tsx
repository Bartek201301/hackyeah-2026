"use client";

import { useEffect } from "react";
import { Button, ErrorState } from "@/shared/ui";

/* Łapie błędy z każdej strony aplikacji. Szczegóły błędu są w konsoli przeglądarki i terminalu. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      description={error.message || "Nieoczekiwany błąd."}
      action={<Button onClick={() => retry()}>Spróbuj ponownie</Button>}
    />
  );
}
