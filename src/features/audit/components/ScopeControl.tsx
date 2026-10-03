import Link from "next/link";
import { cn } from "@/shared/cn";
import { copy } from "../copy";
import type { UtcDay } from "../range";
import { todayUtc } from "../range";
import type { ReportingScope } from "../scope";
import { SCOPES } from "../scope";

const labels: Record<ReportingScope, string> = {
  own: copy.metrics.scopeOwn,
  organisation: copy.metrics.scopeOrganisation,
};

/**
 * Two links, not a privileged control.
 *
 * The organisation option is offered to everyone on purpose: the browser must not decide who may
 * see organisation figures, and hiding the option would turn a rendering choice into an access
 * decision. The gateway refuses the request when the actor may not make it, and that refusal is a
 * state this screen renders (AGENTS.md — a prompt is not an access boundary, and UI role visibility
 * is not authorization).
 */
export function ScopeControl({ scope, day }: { scope: ReportingScope; day?: UtcDay }) {
  const today = todayUtc(new Date());
  // Switching scope keeps the window: silently resetting the day would change two things at once.
  const href = (option: ReportingScope) => {
    const params = new URLSearchParams();
    if (option !== "own") params.set("scope", option);
    if (day && day !== today) params.set("day", day);
    const query = params.toString();
    return query ? `/audit?${query}` : "/audit";
  };

  return (
    <nav aria-label={copy.metrics.scopeLabel} className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted">{copy.metrics.scopeLabel}</span>
      {SCOPES.map((option) => {
        const current = option === scope;
        return (
          <Link
            key={option}
            href={href(option)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-control px-3 py-1.5 text-sm font-semibold",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              current ? "bg-brand text-on-brand" : "border border-border bg-surface text-fg",
            )}
          >
            {labels[option]}
          </Link>
        );
      })}
    </nav>
  );
}
