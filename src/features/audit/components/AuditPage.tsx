import { PageHeader } from "@/shared/ui";
import { copy } from "../copy";
import { parseScope } from "../scope";
import { Dashboard } from "./Dashboard";
import { ScopeControl } from "./ScopeControl";
import { TraceDetail } from "./TraceDetail";

/*
 * One route holds this feature; the view is chosen by search parameters, so a trace link from an
 * audited answer can point at `/audit?trace=<trace_id>` without a new route segment, and the
 * reporting scope lives in `?scope=`. Both are parsed defensively: an unrecognised scope falls back
 * to own activity, and the trace identifier is validated before any request is made.
 */
type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function AuditPage({ searchParams }: AuditPageProps) {
  const params = (await searchParams) ?? {};
  const requested = params.trace;
  const traceId = typeof requested === "string" && requested.length > 0 ? requested : null;
  const scope = parseScope(params.scope);

  return (
    <>
      <PageHeader
        title={traceId ? copy.page.traceTitle : copy.page.dashboardTitle}
        description={traceId ? copy.page.traceDescription : copy.page.dashboardDescription}
        actions={traceId ? undefined : <ScopeControl scope={scope} />}
      />
      {traceId ? <TraceDetail traceId={traceId} /> : <Dashboard scope={scope} />}
    </>
  );
}
