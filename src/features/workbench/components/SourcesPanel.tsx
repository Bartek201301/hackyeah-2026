"use client";

/*
 * W2 sources and import.
 *
 * The browser never decides whether a file is safe. It picks a file, labels it, and reports what the
 * gateway says came back. Accepted formats are stated without promising a byte limit, because
 * `GET /policy` is admin-only and no safe limits projection exists yet (B14).
 *
 * There is deliberately no control anywhere here that downloads an original.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileUp, Inbox, Upload } from "lucide-react";
import { createGatewayClient, newIdempotencyKey, readEnvelope } from "@/shared/contracts/client";
import type { ApiResponse, ImportSummary, Run, SourceSummary } from "@/shared/contracts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Select,
  ThinkingIndicator,
} from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import {
  CLASSIFICATIONS,
  CSV_HEADER,
  EMPTY_UPLOAD_DRAFT,
  buildUploadBody,
  validateUpload,
  type UploadDraft,
  type UploadField,
} from "../lib/importForm";
import { classifyImportResponse, readImportRun } from "../lib/importRun";
import { describeClassification, describeImportStatus, describeSourceKind } from "../lib/importStatus";
import { canonicalInput, keyForAction, type ActionKey } from "../lib/idempotency";
import { POLL_INTERVAL_MS, describeRun, shouldKeepPolling } from "../lib/runState";
import { traceHref } from "../lib/trace";
import { OutcomeNotice } from "./OutcomeNotice";

const client = createGatewayClient();

const classify = (status: number, body: ApiResponse | null): GatewayOutcome =>
  classifyTerminalErrorCode(body) ?? classifyResponse(status, body);

const itemsOf = <T,>(body: ApiResponse | null): T[] => {
  const data: unknown = body?.data ?? null;
  if (typeof data !== "object" || data === null || !("items" in data)) return [];
  const { items } = data as { items: unknown };
  return Array.isArray(items) ? (items as T[]) : [];
};

export function SourcesPanel({ dealIds = [] }: { dealIds?: readonly string[] }) {
  const [draft, setDraft] = useState<UploadDraft>(EMPTY_UPLOAD_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<UploadField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [uploadOutcome, setUploadOutcome] = useState<GatewayOutcome | null>(null);
  /** The import run while it is in flight; null once the gateway settled it. */
  const [run, setRun] = useState<Run | null>(null);

  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [sourcesOutcome, setSourcesOutcome] = useState<GatewayOutcome | null>(null);
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [importsOutcome, setImportsOutcome] = useState<GatewayOutcome | null>(null);

  /* The shared Input does not forward a ref, so the chosen File is held in state. */
  const [file, setFile] = useState<File | null>(null);
  /** Key bound to the exact upload; changing any field mints a new one. */
  const uploadKey = useRef<ActionKey | null>(null);
  /** Guards the contract's "execute exactly once" rule against a double render or double click. */
  const executed = useRef(false);

  /* Fetching is kept free of setState so the effect below applies results in a callback rather
   * than synchronously, which is what react-hooks/set-state-in-effect asks for. */
  const fetchLists = useCallback(async () => {
    const [s, i] = await Promise.all([client.GET("/sources", {}), client.GET("/imports", {})]);
    const sourcesRead = readEnvelope(s);
    const importsRead = readEnvelope(i);
    const sOut = classify(sourcesRead.status, sourcesRead.body);
    const iOut = classify(importsRead.status, importsRead.body);
    return {
      sources: sOut.kind === "result" ? itemsOf<SourceSummary>(sourcesRead.body) : null,
      sourcesOutcome: sOut.kind === "result" ? null : sOut,
      imports: iOut.kind === "result" ? itemsOf<ImportSummary>(importsRead.body) : null,
      importsOutcome: iOut.kind === "result" ? null : iOut,
    };
  }, []);

  const applyLists = useCallback((next: Awaited<ReturnType<typeof fetchLists>>) => {
    setSources(next.sources);
    setSourcesOutcome(next.sourcesOutcome);
    setImports(next.imports);
    setImportsOutcome(next.importsOutcome);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchLists().then((next) => {
      if (active) applyLists(next);
    });
    return () => {
      active = false;
    };
  }, [fetchLists, applyLists]);

  const set = (field: keyof UploadDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const onFile = (chosen: File | null) => {
    setFile(chosen);
    setDraft((d) => ({
      ...d,
      fileName: chosen?.name ?? "",
      fileSize: chosen?.size ?? null,
    }));
  };

  /**
   * One import-lifecycle response -> the upload notice and the in-flight run. A response that ended
   * the lifecycle carries no run, which stops the poll and the progress badge together, and is the
   * moment to re-read the lists: the import has just become a row in them.
   */
  const apply = useCallback(
    (status: number, body: ApiResponse | null) => {
      const { outcome, run: inFlight } = classifyImportResponse(status, body);
      setUploadOutcome(outcome);
      setRun(inFlight);
      if (!inFlight) void fetchLists().then(applyLists);
      return outcome;
    },
    [fetchLists, applyLists],
  );

  const submit = async () => {
    const validation = validateUpload(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setUploadOutcome(null);
    setRun(null);
    executed.current = false;
    setBusy(true);
    uploadKey.current = keyForAction(
      uploadKey.current,
      canonicalInput({
        fileName: draft.fileName,
        fileSize: draft.fileSize,
        classification: draft.classification,
        dealId: draft.dealId.trim() || null,
      }),
      newIdempotencyKey,
    );

    const start = readEnvelope(
      await client.POST("/imports/upload", {
        // openapi-fetch passes FormData through and lets the browser set the multipart boundary.
        body: buildUploadBody(draft, file) as never,
        params: { header: { "Idempotency-Key": uploadKey.current.key } },
      }),
    );
    const created = apply(start.status, start.body);
    const startedRun = readImportRun(start.body?.data ?? null);

    // 202 creates the run and quarantines the file; execute is what parses and checks it. Exactly
    // once, with the same key, so a replay returns the stored outcome instead of importing twice.
    if (created.kind === "progress" && startedRun && !executed.current) {
      executed.current = true;
      const exec = readEnvelope(
        await client.POST("/runs/{id}/execute", {
          params: {
            path: { id: startedRun.id },
            header: { "Idempotency-Key": uploadKey.current.key },
          },
        }),
      );
      apply(exec.status, exec.body);
    }
    setBusy(false);
  };

  // Poll at the protocol interval, only while the tab is visible, and stop on a terminal state.
  useEffect(() => {
    if (!shouldKeepPolling(run)) return;
    const id = run!.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      const polled = readEnvelope(await client.GET("/runs/{id}", { params: { path: { id } } }));
      if (cancelled) return;
      const next = apply(polled.status, polled.body);
      if (next.kind === "unavailable") return;
      if (shouldKeepPolling(readImportRun(polled.body?.data ?? null))) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run, apply]);

  // The same rule as Ask: while the import runs, the indicator carries the gateway's own stage and
  // the notice would only repeat it.
  const working = run && shouldKeepPolling(run) ? describeRun(run) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Upload a file"
          description="One CSV per upload. The gateway stores the original privately and decides what, if anything, may be published."
        />
        <div className="flex flex-col gap-4">
          <Field
            label="File"
            hint={`Accepted: CSV. The header must be ${CSV_HEADER.join(", ")}, and every line of every row is checked.`}
            error={errors.fileName ?? errors.fileSize}
          >
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </Field>

          <Field
            label="Classification"
            hint="The server record decides the final classification; an upload cannot lower it."
            error={errors.classification}
          >
            <Select
              value={draft.classification}
              onChange={(e) => set("classification", e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a classification</option>
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {describeClassification(c).label}
                </option>
              ))}
            </Select>
          </Field>

          {/* Identifiers until a server-side deal-label projection exists (B6). */}
          <Field
            label="Deal (optional)"
            hint={
              dealIds.length > 0
                ? "Narrows scope to one of your assigned deals. It cannot grant access."
                : "No assigned deal is available to this account."
            }
          >
            <Select
              value={draft.dealId}
              onChange={(e) => set("dealId", e.target.value)}
              disabled={busy || dealIds.length === 0}
            >
              <option value="">No deal</option>
              {dealIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <Button onClick={() => void submit()} loading={busy} disabled={busy}>
              <Upload className="size-4" aria-hidden />
              Upload file
            </Button>
          </div>
        </div>
      </Card>

      {working ? (
        <Card>
          <ThinkingIndicator label={working.label} detail={run?.stage?.trim() || undefined} />
        </Card>
      ) : (
        uploadOutcome && <OutcomeNotice outcome={uploadOutcome} />
      )}

      <Card>
        <CardHeader title="Configured sources" />
        {sourcesOutcome ? (
          <OutcomeNotice outcome={sourcesOutcome} />
        ) : sources === null ? (
          <LoadingState label="Loading sources…" />
        ) : sources.length === 0 ? (
          <EmptyState
            icon={<FileUp className="size-5" aria-hidden />}
            title="No source is configured"
            description="Upload a CSV above, and the source it creates appears here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 py-2.5 text-sm text-fg first:pt-0 last:pb-0"
              >
                <span className="font-medium">{s.label}</span>
                <Badge tone={describeClassification(s.classification).tone}>
                  {describeClassification(s.classification).label}
                </Badge>
                <span className="text-muted">{describeSourceKind(s.kind)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Imports"
          description="Processing status and classification are separate: an approved document is not necessarily public."
        />
        {importsOutcome ? (
          <OutcomeNotice outcome={importsOutcome} />
        ) : imports === null ? (
          <LoadingState label="Loading imports…" />
        ) : imports.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden />}
            title="No import yet"
            description="An upload appears here once the gateway has settled what, if anything, it published."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {imports.map((i) => {
              const status = describeImportStatus(i.status);
              const classification = describeClassification(i.classification);
              // ImportSummary carries no label, so the trace is what makes a row identifiable: it is
              // the audited record of this very import, and the run id is its trace id.
              const href = traceHref(i.run_id);
              return (
                <li key={i.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge tone={classification.tone}>{classification.label}</Badge>
                  </span>
                  <span className="text-sm text-muted">{status.detail}</span>
                  {href && (
                    <Link
                      href={href}
                      className="text-sm font-medium text-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                    >
                      View the audited trace
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
