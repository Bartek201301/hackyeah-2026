"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/shared/ui";
import { createGatewayClient, readEnvelope } from "@/shared/contracts/client";
import type { TraceReadState } from "../envelope";
import { classifyTraceRead } from "../envelope";
import { copy } from "../copy";
import { isUuid } from "../format";
import { stageRows } from "../trace";
import { StageList } from "./StageList";
import { TraceStateBlock } from "./TraceStates";
import { TraceSummary } from "./TraceSummary";

/** The answer belongs to one request; a stale reply for a previous id is ignored. */
type Result = { request: string; state: TraceReadState };

/**
 * Reads one trace through the shared typed client. A client component on purpose: the gateway
 * is reached with the viewer's own session over same-origin credentials, so the screen shows
 * exactly what that actor is allowed to see, and the loading state is real rather than staged.
 *
 * Nothing is rendered from a local example. While the audit routes are still the unavailable
 * seam, this screen shows the gateway's own 503 state, which is the honest answer.
 */
export function TraceDetail({ traceId }: { traceId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  // A malformed identifier is answered here; sending it to the gateway would prove nothing.
  const malformed = !isUuid(traceId);
  const request = `${traceId}#${attempt}`;
  const loading = !malformed && result?.request !== request;

  useEffect(() => {
    if (malformed) return;
    const controller = new AbortController();

    void createGatewayClient()
      .GET("/audit/{id}", { params: { path: { id: traceId } }, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        // readEnvelope takes the body from whichever branch carries it: openapi-fetch puts a
        // governed refusal in `error`, and that refusal is exactly what this screen renders.
        const { status, body } = readEnvelope(result);
        setResult({ request, state: classifyTraceRead(status, body) });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ request, state: { kind: "clientError" } });
      });

    return () => controller.abort();
  }, [malformed, request, traceId]);

  const retry = () => setAttempt((previous) => previous + 1);

  if (malformed) return <TraceStateBlock state={{ kind: "notFound" }} onRetry={retry} />;
  if (loading || result === null) return <LoadingState label={copy.state.loading} />;
  if (result.state.kind !== "ok") return <TraceStateBlock state={result.state} onRetry={retry} />;

  const { trace, incomplete, cancelled, eventsCapped, serverMessage } = result.state;
  return (
    <div className="flex flex-col gap-6">
      <TraceSummary
        trace={trace}
        incomplete={incomplete}
        cancelled={cancelled}
        eventsCapped={eventsCapped}
        serverMessage={serverMessage}
      />
      <StageList rows={stageRows(trace.events)} />
    </div>
  );
}
