"use client";

import { useRouter } from "next/navigation";
import { Field, Input } from "@/shared/ui";
import { copy } from "../copy";
import type { UtcDay } from "../range";
import { isUtcDay, todayUtc } from "../range";
import type { ReportingScope } from "../scope";

/**
 * Picks the UTC day the figures describe. The day lives in the URL, so a window is shareable and a
 * reload shows the same evidence — which matters when a number has to be defended later.
 *
 * Only a day that exists is navigated to; the input's own value is not trusted, because a typed or
 * pasted value reaches this handler before any server sees it.
 */
export function DayControl({ day, scope }: { day: UtcDay; scope: ReportingScope }) {
  const router = useRouter();
  const today = todayUtc(new Date());

  const go = (next: string) => {
    if (!isUtcDay(next)) return;
    const params = new URLSearchParams();
    if (scope !== "own") params.set("scope", scope);
    if (next !== today) params.set("day", next);
    const query = params.toString();
    router.push(query ? `/audit?${query}` : "/audit");
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Field renders a wrapping <label>, so the input needs no separate association. */}
      <Field label={copy.range.label}>
        <Input type="date" value={day} max={today} onChange={(event) => go(event.target.value)} />
      </Field>
      {day === today ? (
        <span className="pb-2.5 text-xs text-muted">{copy.range.current}</span>
      ) : (
        <button
          type="button"
          onClick={() => go(today)}
          className="rounded-control pb-2.5 text-xs font-semibold text-brand underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {copy.range.today}
        </button>
      )}
    </div>
  );
}
