import Link from "next/link";
import { cn } from "@/shared/cn";
import { VIEW_LABELS, WORKBENCH_VIEWS, viewHref, type WorkbenchView } from "../lib/views";

/*
 * In-page navigation. There is no tabs primitive in shared/ui and feature CSS is forbidden, so this
 * is a plain list of links styled with token classes: real navigation, keyboard-reachable, with
 * aria-current marking the active view. Requested as a shared primitive (B3).
 */
export function WorkbenchNav({ active }: { active: WorkbenchView }) {
  return (
    <nav aria-label="Workbench views" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {WORKBENCH_VIEWS.map((view) => {
          const current = view === active;
          return (
            <li key={view}>
              <Link
                href={viewHref(view)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-control px-3.5 text-sm font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  current
                    ? "bg-brand text-on-brand shadow-brand"
                    : "border border-border bg-surface text-fg hover:bg-surface-muted",
                )}
              >
                {VIEW_LABELS[view]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
