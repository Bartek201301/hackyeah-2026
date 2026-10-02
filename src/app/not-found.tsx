import Link from "next/link";
import { EmptyState } from "@/shared/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Nie ma takiej strony"
      description="Adres jest nieprawidłowy albo strona została przeniesiona."
      action={
        <Link href="/" className="text-sm font-medium text-brand hover:underline">
          Wróć na stronę główną
        </Link>
      }
    />
  );
}
