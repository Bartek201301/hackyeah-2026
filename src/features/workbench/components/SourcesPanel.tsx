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
import { Upload } from "lucide-react";
import { createGatewayClient, newIdempotencyKey, readEnvelope } from "@/shared/contracts/client";
import type { ApiResponse, ImportSummary, SourceSummary } from "@/shared/contracts";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import {
  CLASSIFICATIONS,
  CSV_HEADER,
  EMPTY_UPLOAD_DRAFT,
  BASIS_VALUES,
  buildUploadBody,
  formatOf,
  validateUpload,
  type UploadDraft,
  type UploadField,
} from "../lib/importForm";
import { describeClassification, describeImportStatus, describeSourceKind } from "../lib/importStatus";
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

  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [sourcesOutcome, setSourcesOutcome] = useState<GatewayOutcome | null>(null);
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [importsOutcome, setImportsOutcome] = useState<GatewayOutcome | null>(null);

  /* The shared Input does not forward a ref, so the chosen File is held in state. */
  const [file, setFile] = useState<File | null>(null);
  /** One key per upload action, reused when retrying that same upload. */
  const uploadKey = useRef<string | null>(null);

  const format = formatOf(draft.fileName);

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

  const submit = async () => {
    const validation = validateUpload(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    uploadKey.current ??= newIdempotencyKey();

    const { status, body } = readEnvelope(
      await client.POST("/imports/upload", {
        // openapi-fetch passes FormData through and lets the browser set the multipart boundary.
        body: buildUploadBody(draft, file) as never,
        params: { header: { "Idempotency-Key": uploadKey.current } },
      }),
    );
    setUploadOutcome(classify(status, body));
    setBusy(false);
    void fetchLists().then(applyLists);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Upload a file"
          description="One CSV or one text PDF per upload. The gateway stores the original privately and decides what, if anything, may be published."
        />
        <div className="flex flex-col gap-4">
          <Field
            label="File"
            hint={`Accepted: CSV or text PDF. A CSV needs the header ${CSV_HEADER.join(", ")}.`}
            error={errors.fileName ?? errors.fileSize}
          >
            <Input
              type="file"
              accept=".csv,.pdf"
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

          {/* Required by business validation for a text PDF; a CSV carries these per row. */}
          {format === "pdf" && (
            <>
              <Field label="Source date" error={errors.sourceDate}>
                <Input
                  type="date"
                  value={draft.sourceDate}
                  onChange={(e) => set("sourceDate", e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Period" hint="For example FY2025." error={errors.period}>
                <Input value={draft.period} onChange={(e) => set("period", e.target.value)} disabled={busy} />
              </Field>
              <Field label="Unit" hint="For example USD million." error={errors.unit}>
                <Input value={draft.unit} onChange={(e) => set("unit", e.target.value)} disabled={busy} />
              </Field>
              <Field label="Fact key" hint="For example revenue." error={errors.factKey}>
                <Input
                  value={draft.factKey}
                  onChange={(e) => set("factKey", e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Basis" error={errors.basis}>
                <Select value={draft.basis} onChange={(e) => set("basis", e.target.value)} disabled={busy}>
                  <option value="">Choose a basis</option>
                  {BASIS_VALUES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <div>
            <Button onClick={() => void submit()} loading={busy} disabled={busy}>
              <Upload className="size-4" aria-hidden />
              Upload file
            </Button>
          </div>
        </div>
      </Card>

      {uploadOutcome && <OutcomeNotice outcome={uploadOutcome} />}

      <Card>
        <CardHeader title="Configured sources" />
        {sourcesOutcome ? (
          <OutcomeNotice outcome={sourcesOutcome} />
        ) : sources === null ? (
          <p className="text-sm text-muted">Loading sources…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted">No source is configured for this account.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm text-fg">
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
          <p className="text-sm text-muted">Loading imports…</p>
        ) : imports.length === 0 ? (
          <p className="text-sm text-muted">This account has no imports yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {imports.map((i) => {
              const status = describeImportStatus(i.status);
              const classification = describeClassification(i.classification);
              return (
                <li key={i.id} className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge tone={classification.tone}>{classification.label}</Badge>
                  </span>
                  <span className="text-sm text-muted">{status.detail}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
