"use client";

/*
 * W5 public summary and PDF download.
 *
 * Scope is the contract as it stands (B16, answered by Bartosz): no summary preview. A completed
 * export returns `{download_path, expires_at}`; the checked text is inside the PDF the gateway
 * generated and scanned. Re-assembling a "preview" in the browser would publish a second, unchecked
 * copy of the answer, which is exactly what the export path exists to prevent.
 *
 * Lifecycle matches chat (protocols.md): create → execute exactly once → poll the run at one-second
 * intervals while the screen is visible → stop on a terminal state. The download appears only when
 * the gateway released one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, SquareX } from "lucide-react";
import { createGatewayClient, newIdempotencyKey, readEnvelope } from "@/shared/contracts/client";
import type { ApiResponse, Run } from "@/shared/contracts";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select } from "@/shared/ui";
import type { GatewayOutcome } from "../lib/envelope";
import { canonicalInput, keyForAction, type ActionKey } from "../lib/idempotency";
import {
  MAX_TOPIC,
  classifyExportResponse,
  expiryInstant,
  hasExpired,
  readExportReady,
  readExportRun,
  validateTopic,
  type ExportReady,
} from "../lib/export";
import { POLL_INTERVAL_MS, canCancel, progressLabel, shouldKeepPolling } from "../lib/runState";
import { OutcomeNotice } from "./OutcomeNotice";

const client = createGatewayClient();

export function ExportPanel({ dealIds = [] }: { dealIds?: readonly string[] }) {
  const [topic, setTopic] = useState("");
  const [dealId, setDealId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [outcome, setOutcome] = useState<GatewayOutcome | null>(null);
  const [ready, setReady] = useState<ExportReady | null>(null);

  /** One key per export request; the same request retried keeps it. */
  const actionKey = useRef<ActionKey | null>(null);
  /** Guards the contract's "execute exactly once" rule against a double render or double click. */
  const executed = useRef(false);

  const apply = useCallback((status: number, body: ApiResponse | null) => {
    const { outcome: next, run: polled } = classifyExportResponse(status, body);
    setOutcome(next);
    if (polled) setRun(polled);
    // Only a released result may offer a download.
    setReady(next.showsResult ? readExportReady(body?.data ?? null) : null);
    return next;
  }, []);

  const submit = async () => {
    const validation = validateTopic(topic);
    if (!validation.ok) {
      setValidationError(validation.error);
      return;
    }
    setValidationError(null);
    setOutcome(null);
    setReady(null);
    setRun(null);
    executed.current = false;
    setBusy(true);

    const deal = dealId.trim();
    actionKey.current = keyForAction(
      actionKey.current,
      canonicalInput({ topic: validation.topic, deal: deal || null }),
      newIdempotencyKey,
    );

    const start = readEnvelope(
      await client.POST("/exports", {
        // A deal narrows scope; it cannot grant access. Omitted entirely when none is chosen.
        body: deal ? { topic: validation.topic, deal_id: deal } : { topic: validation.topic },
        params: { header: { "Idempotency-Key": actionKey.current.key } },
      }),
    );
    const created = apply(start.status, start.body);
    const startedRun = readExportRun(start.body?.data ?? null);

    if (created.kind === "progress" && startedRun && !executed.current) {
      executed.current = true;
      const exec = readEnvelope(
        await client.POST("/runs/{id}/execute", {
          params: {
            path: { id: startedRun.id },
            header: { "Idempotency-Key": actionKey.current.key },
          },
        }),
      );
      apply(exec.status, exec.body);
    }
    setBusy(false);
  };

  const cancel = async () => {
    if (!run) return;
    const { status, body } = readEnvelope(
      await client.POST("/runs/{id}/cancel", {
        params: { path: { id: run.id }, header: { "Idempotency-Key": newIdempotencyKey() } },
      }),
    );
    apply(status, body);
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
      if (shouldKeepPolling(readExportRun(polled.body?.data ?? null))) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run, apply]);

  const progress = run ? progressLabel(run) : null;
  const expiry = ready ? expiryInstant(ready.expiresAt) : null;
  const expired = ready ? hasExpired(ready.expiresAt) : false;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Request a public summary"
          description="The gateway writes a fresh PDF from approved public material only, checks it, and keeps it private behind an authenticated download."
        />
        <div className="flex flex-col gap-4">
          <Field
            label="Topic"
            hint={`${topic.trim().length} of ${MAX_TOPIC} characters.`}
            error={validationError ?? undefined}
          >
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={MAX_TOPIC}
              placeholder="AsterCloud revenue for FY2025"
              disabled={busy}
            />
          </Field>

          <Field
            label="Deal (optional)"
            hint={
              dealIds.length === 0
                ? "No assigned deal is available to this account."
                : "Narrows the material considered. It cannot grant access."
            }
          >
            <Select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
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

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} loading={busy} disabled={busy}>
              <FileText className="size-4" aria-hidden />
              Create summary
            </Button>
            {canCancel(run) && (
              <Button variant="secondary" onClick={() => void cancel()}>
                <SquareX className="size-4" aria-hidden />
                Cancel run
              </Button>
            )}
            {outcome?.retryable && !busy && (
              <Button variant="secondary" onClick={() => void submit()}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </Card>

      {progress && (
        <Card>
          <CardHeader title="Progress" actions={<Badge tone="brand">{progress}</Badge>} />
          {/* Server-reported stage only; no generated text while work is in flight. */}
          <p role="status" className="text-sm text-muted">
            {progress}
          </p>
        </Card>
      )}

      {outcome && <OutcomeNotice outcome={outcome} />}

      {/* Rendered only when the gateway released a checked PDF. */}
      {outcome?.showsResult && ready && (
        <Card>
          <CardHeader
            title="Summary ready"
            description="The checked summary and its citations are inside the PDF. Nothing is previewed here, because only the file the gateway scanned may be shown."
            actions={expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Available</Badge>}
          />
          <div className="flex flex-col gap-3">
            {expired ? (
              <Notice tone="danger">
                This download expired at {expiry}. Create a new summary to get a fresh one.
              </Notice>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Expires at {expiry}. The download checks your account again before it sends the file.
                </p>
                <div>
                  {/* An anchor, not a Button: the shared Button renders a <button> and this is a
                      navigation to an authenticated gateway path. The path is used verbatim. */}
                  <a
                    href={ready.downloadPath}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-brand px-5 text-sm font-semibold text-on-brand shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Download className="size-4" aria-hidden />
                    Download the PDF
                  </a>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
