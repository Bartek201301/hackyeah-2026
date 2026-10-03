import Link from "next/link";
import { EmptyState } from "@/shared/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The address is invalid or the page has moved."
      action={
        <Link href="/" className="text-sm font-medium text-brand hover:underline">
          Back to the home page
        </Link>
      }
    />
  );
}
