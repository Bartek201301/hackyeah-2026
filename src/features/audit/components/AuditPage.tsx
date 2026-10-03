import { PageHeader } from "@/shared/ui";
import { copy } from "../copy";
import { Dashboard } from "./Dashboard";
import { TraceDetail } from "./TraceDetail";

/*
 * One route holds this feature; the view is chosen by search parameter, so a trace link from
 * an audited answer can point at `/audit?trace=<trace_id>` without a new route segment.
 * Without a trace the personal dashboard is shown. The organisation scope is a later slice and
 * is not offered here yet, because offering a control whose refusal is unhandled would be worse
 * than not offering it.
 */
type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function AuditPage({ searchParams }: AuditPageProps) {
  const params = (await searchParams) ?? {};
  const requested = params.trace;
  const traceId = typeof requested === "string" && requested.length > 0 ? requested : null;

  return (
    <>
      <PageHeader
        title={traceId ? copy.page.traceTitle : copy.page.dashboardTitle}
        description={traceId ? copy.page.traceDescription : copy.page.dashboardDescription}
      />
      {traceId ? <TraceDetail traceId={traceId} /> : <Dashboard />}
    </>
  );
}
