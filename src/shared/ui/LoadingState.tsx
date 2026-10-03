import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/cn";

/** Loading state for a whole section/page. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Grey placeholder rectangle where content is loading. Set its size with classes: <Skeleton className="h-4 w-40" /> */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-border", className)} />;
}
