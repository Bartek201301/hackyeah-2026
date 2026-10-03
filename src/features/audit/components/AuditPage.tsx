import { PageHeader } from "@/shared/ui";
import { copy } from "../copy";
import { parseDay } from "../range";
import { parseScope } from "../scope";
import { Dashboard } from "./Dashboard";
import { DayControl } from "./DayControl";
import { ScopeControl } from "./ScopeControl";
import { TraceDetail } from "./TraceDetail";

/*
 * One route holds this feature; the view is chosen by search parameters, so a trace link from an
 * audited answer can point at `/audit?trace=<trace_id>` without a new route segment, the reporting
 * scope lives in `?scope=` and the window in `?day=`. All three are parsed defensively: an
 * unrecognised scope falls back to own activity, an impossible day to the current UTC day, and the
 * trace identifier is validated before any request is made.
 */
type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function AuditPage({ searchParams }: AuditPageProps) {
  const params = (await searchParams) ?? {};
  const requested = params.trace;
  const traceId = typeof requested === "string" && requested.length > 0 ? requested : null;
  const scope = parseScope(params.scope);
  const day = parseDay(params.day, new Date());

  return (
    <>
      <PageHeader
        title={traceId ? copy.page.traceTitle : copy.page.dashboardTitle}
        description={traceId ? copy.page.traceDescription : copy.page.dashboardDescription}
        actions={traceId ? undefined : <ScopeControl scope={scope} day={day} />}
      />
      {traceId ? (
        <TraceDetail traceId={traceId} />
      ) : (
        <div className="flex flex-col gap-6">
          <DayControl day={day} scope={scope} />
          <Dashboard scope={scope} day={day} />
        </div>
      )}
    </>
  );
}
