"use client";

import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@/shared/ui";
import { createGatewayClient, readEnvelope } from "@/shared/contracts/client";
import type { ActivityReadState, ActivityRow } from "../activity";
import { classifyActivityRead } from "../activity";
import type { MetricsReadState } from "../metrics";
import { classifyMetricsRead, metricsView } from "../metrics";
import { copy } from "../copy";
import type { UtcDay } from "../range";
import { dayBounds } from "../range";
import type { ReportingScope } from "../scope";
import { ActivityList } from "./ActivityList";
import { DashboardStateBlock } from "./DashboardStates";
import { ExportButton } from "./ExportButton";
import { ControlsPanel, ResourcesPanel, ScopeLine } from "./MetricsPanels";

type Result = { request: string; metrics: MetricsReadState; activity: ActivityReadState };

/** Pages fetched after the first one, keyed by the request that started them. */
type Older = { request: string; rows: ActivityRow[]; cursor: string | null; capped: boolean };

/**
 * The personal dashboard: what the gateway decided, and what those operations consumed.
 *
 * The two reads are classified independently, so a failing metrics call does not hide the activity
 * list and vice versa — each section states its own truth.
 *
 * The metrics read is confined to one UTC day, taken from the URL and sent as explicit bounds, so the
 * window is shareable and a figure can be defended later. `GET /audit` takes no range parameter, only
 * a cursor, so the list is not day-scoped and its copy does not pretend otherwise.
 */
export function Dashboard({ scope = "own", day }: { scope?: ReportingScope; day: UtcDay }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [older, setOlder] = useState<Older | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);

  const request = `${scope}#${day}#${attempt}`;
  const loading = result?.request !== request;
  // Keyed by request, so changing the day or the scope drops earlier pages without a reset effect.
  const pages = older?.request === request ? older : null;

  useEffect(() => {
    const controller = new AbortController();
    const client = createGatewayClient();
    const signal = controller.signal;
    const { from, to } = dayBounds(day);

    void Promise.all([
      client
        .GET("/metrics", { params: { query: { scope, from, to } }, signal })
        .then((result) => {
          const { status, body } = readEnvelope(result);
          return classifyMetricsRead(status, body);
        })
        .catch((): MetricsReadState => ({ kind: "clientError" })),
      client
        .GET("/audit", { signal })
        .then((result) => {
          const { status, body } = readEnvelope(result);
          // No actor column: GET /audit has no scope parameter, so every row is the reader's own and
          // a repeated identifier would only suggest the list had been widened.
          return classifyActivityRead(status, body);
        })
        .catch((): ActivityReadState => ({ kind: "clientError" })),
    ]).then(([metrics, activity]) => {
      if (signal.aborted) return;
      setResult({ request, metrics, activity });
    });

    return () => controller.abort();
  }, [request, scope, day]);

  if (loading || result === null) return <LoadingState label={copy.state.loading} />;

  const retry = () => setAttempt((previous) => previous + 1);
  const { metrics, activity } = result;

  // Both reads hit the same gateway, so they usually fail the same way. Saying it twice would be
  // noise, not extra honesty.
  if (metrics.kind !== "ok" && activity.kind !== "ok" && metrics.kind === activity.kind) {
    return <DashboardStateBlock state={metrics} onRetry={retry} />;
  }

  // A refused organisation scope shows nothing from that scope. `GET /audit` takes no scope
  // parameter, so its rows are the reader's own — and leaving them on screen under a refused
  // organisation heading would read as a partial organisation list.
  if (scope === "organisation" && metrics.kind === "denied") {
    return (
      <div className="flex flex-col gap-3">
        <DashboardStateBlock state={metrics} onRetry={retry} />
        <p className="text-xs text-muted">{copy.metrics.scopeDeniedHint}</p>
      </div>
    );
  }

  const view = metrics.kind === "ok" ? metricsView(metrics.metrics) : null;
  const firstPage = activity.kind === "ok" ? activity : null;
  const rows = firstPage ? [...firstPage.rows, ...(pages?.rows ?? [])] : [];
  const cursor = pages ? pages.cursor : (firstPage?.nextCursor ?? null);
  const moreMayExist = pages ? pages.capped : (firstPage?.pageCapped ?? false);

  /** One page at a time, appended; a failed page never discards the rows already shown. */
  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      const { status, body } = readEnvelope(
        await createGatewayClient().GET("/audit", { params: { query: { after: cursor } } }),
      );
      const next = classifyActivityRead(status, body);
      if (next.kind !== "ok") {
        setOlderFailed(true);
        return;
      }
      setOlder({
        request,
        rows: [...(pages?.rows ?? []), ...next.rows],
        cursor: next.nextCursor,
        capped: next.pageCapped,
      });
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  // A day with nothing in it is reported as empty, not as five measured zeros beside an empty list.
  // Zeros are shown only when something happened and the counter really is zero.
  const emptyWindow = view?.empty === true && firstPage !== null && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {view && <ScopeLine view={view} />}

      {metrics.kind !== "ok" && <DashboardStateBlock state={metrics} onRetry={retry} />}

      {view && !emptyWindow && (
        // Equal visibility for decisions and resources: neither group is a sidebar of the other.
        <div className="grid gap-6 xl:grid-cols-2">
          <ControlsPanel view={view} />
          <ResourcesPanel view={view} />
        </div>
      )}

      {emptyWindow ? (
        <EmptyState title={copy.metrics.emptyTitle} description={copy.metrics.emptyDescription} />
      ) : activity.kind === "ok" ? (
        <ActivityList
          rows={rows}
          moreMayExist={moreMayExist}
          onLoadOlder={cursor ? loadOlder : undefined}
          loadingOlder={loadingOlder}
          olderFailed={olderFailed}
        />
      ) : (
        <DashboardStateBlock state={activity} onRetry={retry} />
      )}

      {/* The export asks the gateway for the same scope and the same day this screen is showing. */}
      <ExportButton scope={scope} day={day} />
    </div>
  );
}
