"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button, Notice } from "@/shared/ui";
import type { ExportState } from "../export";
import { classifyExportResponse, exportPath } from "../export";
import { copy } from "../copy";
import type { UtcDay } from "../range";
import type { ReportingScope } from "../scope";

/**
 * Requests the authorised audit CSV for the scope on screen.
 *
 * Three things this control must get right:
 *  - one request per double click: the button is disabled while a request is in flight, and an
 *    in-flight guard also blocks a programmatic second call
 *  - the CSV body never reaches the page: the response becomes an object URL handed to a download,
 *    and is revoked immediately, so no cell is ever rendered or logged
 *  - the export is itself an audited access, so its own trace identifier is shown on success
 *
 * Cell neutralisation of leading `=`, `+`, `-`, `@`, tab and CR stays the gateway's job. Nothing here
 * rewrites a byte: a client that quietly fixed a cell would hide a server that stopped doing it.
 */
export function ExportButton({ scope, day }: { scope: ReportingScope; day: UtcDay }) {
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const inFlight = useRef(false);

  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "preparing" });

    try {
      const response = await fetch(`/api/v1${exportPath(scope, day)}`, {
        credentials: "same-origin",
        headers: { Accept: "text/csv" },
      });
      const contentType = response.headers.get("content-type");
      const isCsv = (contentType ?? "").toLowerCase().includes("text/csv");
      const body = isCsv ? null : await response.json().catch(() => null);

      const next = classifyExportResponse(
        response.status,
        contentType,
        body,
        {
          traceId: response.headers.get("x-trace-id"),
          contentDisposition: response.headers.get("content-disposition"),
        },
        scope,
        day,
      );

      if (next.kind === "done") {
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = next.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setState(next);
    } catch {
      setState({ kind: "clientError" });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={download} loading={state.kind === "preparing"}>
        <Download className="size-4" aria-hidden />
        {state.kind === "preparing" ? copy.export.preparing : copy.export.button}
      </Button>
      <ExportResult state={state} />
    </div>
  );
}

function ExportResult({ state }: { state: ExportState }) {
  switch (state.kind) {
    case "idle":
    case "preparing":
      return null;
    case "done":
      return (
        <Notice tone="success">
          {state.traceId ? copy.export.done.replace("{trace}", state.traceId) : copy.export.doneNoTrace}{" "}
          {copy.export.neutralisation}
        </Notice>
      );
    case "overCap":
      // The gateway's own instruction, shown verbatim: it names what to narrow.
      return (
        <Notice tone="info">
          <strong className="font-semibold">{copy.export.overCapTitle}</strong> {state.message}
        </Notice>
      );
    case "denied":
      return <Notice tone="danger">{copy.export.deniedBody}</Notice>;
    case "unauthenticated":
      return <Notice tone="danger">{copy.state.unauthenticatedBody}</Notice>;
    case "rateLimited":
      return <Notice tone="danger">{copy.state.rateLimitedBody}</Notice>;
    default:
      return (
        <Notice tone="danger">
          <strong className="font-semibold">{copy.export.failedTitle}</strong> {copy.export.failedBody}
        </Notice>
      );
  }
}
