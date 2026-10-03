import Link from "next/link";
import { EmptyState } from "@/shared/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <EmptyState
          title="Page not found"
          description="The address is invalid or the page has moved."
          action={
            <Link
              href="/workbench"
              className="rounded-control text-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
            >
              Back to the app
            </Link>
          }
        />
      </div>
    </main>
  );
}
