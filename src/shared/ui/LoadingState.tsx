import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/cn";

/** Stan ładowania całej sekcji/strony. */
export function LoadingState({ label = "Ładowanie…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Szary prostokąt-zaślepka w miejscu treści, która się wczytuje. Wymiary nadaj klasami: <Skeleton className="h-4 w-40" /> */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-border", className)} />;
}
