"use client";

import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@/shared/ui";
import { createGatewayClient } from "@/shared/contracts/client";
import type { ActivityReadState } from "../activity";
import { classifyActivityRead } from "../activity";
import type { MetricsReadState } from "../metrics";
import { classifyMetricsRead, metricsView } from "../metrics";
import { copy } from "../copy";
import { ActivityList } from "./ActivityList";
import { DashboardStateBlock } from "./DashboardStates";
import { ControlsPanel, ResourcesPanel, ScopeLine } from "./MetricsPanels";

type Result = { request: string; metrics: MetricsReadState; activity: ActivityReadState };

/**
 * The personal dashboard: what the gateway decided, and what those operations consumed.
 *
 * The two reads are classified independently, so a failing metrics call does not hide the
 * activity list and vice versa — each section states its own truth. No range is sent, which
 * means the gateway's default window applies and the response's own `from`/`to` are displayed
 * rather than a window this screen assumed.
 */
export function Dashboard({ scope = "own" }: { scope?: "own" | "organisation" }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const request = `${scope}#${attempt}`;
  const loading = result?.request !== request;

  useEffect(() => {
    const controller = new AbortController();
    const client = createGatewayClient();
    const signal = controller.signal;

    void Promise.all([
      client
        .GET("/metrics", { params: { query: { scope } }, signal })
        .then(({ data, error, response }) => classifyMetricsRead(response.status, data ?? error))
        .catch((): MetricsReadState => ({ kind: "clientError" })),
      client
        .GET("/audit", { signal })
        .then(({ data, error, response }) =>
          classifyActivityRead(response.status, data ?? error, { showActor: scope === "organisation" }),
        )
        .catch((): ActivityReadState => ({ kind: "clientError" })),
    ]).then(([metrics, activity]) => {
      if (signal.aborted) return;
      setResult({ request, metrics, activity });
    });

    return () => controller.abort();
  }, [request, scope]);

  if (loading || result === null) return <LoadingState label={copy.state.loading} />;

  const retry = () => setAttempt((previous) => previous + 1);
  const { metrics, activity } = result;

  // Both reads hit the same gateway, so they usually fail the same way. Saying it twice would be
  // noise, not extra honesty.
  if (metrics.kind !== "ok" && activity.kind !== "ok" && metrics.kind === activity.kind) {
    return <DashboardStateBlock state={metrics} onRetry={retry} />;
  }

  const view = metrics.kind === "ok" ? metricsView(metrics.metrics) : null;

  // A day with nothing in it is reported as empty, not as five measured zeros beside an empty
  // list. Zeros are shown only when something happened and the counter really is zero.
  const emptyWindow = view?.empty === true && activity.kind === "ok" && activity.rows.length === 0;

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
        <ActivityList rows={activity.rows} pageCapped={activity.pageCapped} />
      ) : (
        <DashboardStateBlock state={activity} onRetry={retry} />
      )}
    </div>
  );
}
