"use client";

/*
 * W1 minimal controlled chat.
 *
 * Calls the real gateway through the shared typed client. While `/api/v1/*` returns 503 this screen
 * correctly shows the service-unavailable state — that is the honest behaviour, not a placeholder,
 * and it means no code has to change when Bartosz's routes land.
 *
 * Lifecycle (docs/contracts/protocols.md): create -> execute exactly once -> poll the returned run
 * id at one-second intervals while the screen is visible -> stop on a terminal state. Nothing is
 * rendered from the model until the gateway reports a releasable decision.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, SquareX } from "lucide-react";
import { createGatewayClient, newIdempotencyKey } from "@/shared/contracts/client";
import type { ApiResponse, Run } from "@/shared/contracts";
import { Badge, Button, Card, CardHeader, Field, Textarea } from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import { readChatResult, readChatRun, type ChatResult } from "../lib/chatData";
import { checkCitations, type CitationView } from "../lib/citations";
import { POLL_INTERVAL_MS, canCancel, progressLabel, shouldKeepPolling } from "../lib/runState";
import { OutcomeNotice } from "./OutcomeNotice";

/** Matches ChatRequest.message in the contract. */
const MAX_MESSAGE = 4000;

const client = createGatewayClient();

/** openapi-fetch puts a non-2xx envelope on `error`; both carry the same shape. */
const envelopeOf = (data: unknown, error: unknown): ApiResponse | null =>
  ((data ?? error) as ApiResponse | undefined) ?? null;

const classify = (status: number, body: ApiResponse | null): GatewayOutcome =>
  classifyTerminalErrorCode(body) ?? classifyResponse(status, body);

export function ChatPanel() {
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [outcome, setOutcome] = useState<GatewayOutcome | null>(null);
  const [result, setResult] = useState<ChatResult | null>(null);
  const [citations, setCitations] = useState<CitationView[]>([]);
  const [rejectedCitations, setRejectedCitations] = useState(false);

  /** One key per user action, reused when retrying that same action (never regenerated on retry). */
  const idempotencyKey = useRef<string | null>(null);
  /** Guards the contract's "execute exactly once" rule against a double render or double click. */
  const executed = useRef(false);

  const reset = () => {
    setOutcome(null);
    setResult(null);
    setCitations([]);
    setRejectedCitations(false);
    setRun(null);
    executed.current = false;
  };

  /** Apply one response: narrow the operation-specific shape, then classify. */
  const apply = useCallback((status: number, body: ApiResponse | null) => {
    const next = classify(status, body);
    setOutcome(next);

    const polled = readChatRun(body?.data ?? null);
    if (polled) setRun(polled);

    if (!next.showsResult) {
      setResult(null);
      setCitations([]);
      setRejectedCitations(false);
      return next;
    }

    // Only now may generated text be rendered, and only citations the same response permitted.
    const chat = readChatResult(body?.data ?? null);
    if (chat) {
      setResult(chat);
      const permitted = chat.citations.map((c) => c.excerpt_id);
      const checked = checkCitations(chat.citations, permitted);
      setCitations(checked.accepted);
      setRejectedCitations(checked.hasRejected);
    }
    return next;
  }, []);

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      setValidationError("Enter a question before sending.");
      return;
    }
    if (trimmed.length > MAX_MESSAGE) {
      setValidationError(`Shorten the question to ${MAX_MESSAGE} characters or fewer.`);
      return;
    }
    setValidationError(null);
    reset();
    setBusy(true);

    idempotencyKey.current ??= newIdempotencyKey();
    const { data, error, response } = await client.POST("/chat", {
      body: { message: trimmed },
      params: { header: { "Idempotency-Key": idempotencyKey.current } },
    });
    const created = apply(response.status, envelopeOf(data, error));
    const startedRun = readChatRun(envelopeOf(data, error)?.data ?? null);

    // Execute only a run the gateway actually created, and only once.
    if (created.kind === "progress" && startedRun && !executed.current) {
      executed.current = true;
      const exec = await client.POST("/runs/{id}/execute", {
        params: {
          path: { id: startedRun.id },
          header: { "Idempotency-Key": idempotencyKey.current },
        },
      });
      apply(exec.response.status, envelopeOf(exec.data, exec.error));
    }
    setBusy(false);
  };

  const cancel = async () => {
    if (!run) return;
    const { data, error, response } = await client.POST("/runs/{id}/cancel", {
      params: { path: { id: run.id }, header: { "Idempotency-Key": newIdempotencyKey() } },
    });
    apply(response.status, envelopeOf(data, error));
  };

  /** Retry the same action: the idempotency key is deliberately kept. */
  const retry = () => void submit();

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
      const { data, error, response } = await client.GET("/runs/{id}", {
        params: { path: { id } },
      });
      if (cancelled) return;
      const body = envelopeOf(data, error);
      const next = apply(response.status, body);
      // A service error during polling is terminal for this screen: stop and say so.
      if (next.kind === "unavailable") return;
      if (shouldKeepPolling(readChatRun(body?.data ?? null))) {
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Ask a question"
          description="One question per request. The gateway checks identity, policy, content and budget before releasing an answer."
        />
        <div className="flex flex-col gap-4">
          <Field
            label="Question"
            hint={`${message.trim().length} of ${MAX_MESSAGE} characters.`}
            error={validationError ?? undefined}
          >
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Brief me on AsterCloud revenue and cite sources."
              maxLength={MAX_MESSAGE}
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} loading={busy} disabled={busy}>
              <Send className="size-4" aria-hidden />
              Send question
            </Button>
            {canCancel(run) && (
              <Button variant="secondary" onClick={() => void cancel()}>
                <SquareX className="size-4" aria-hidden />
                Cancel run
              </Button>
            )}
            {outcome?.retryable && !busy && (
              <Button variant="secondary" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </Card>

      {progress && (
        <Card>
          <CardHeader title="Progress" actions={<Badge tone="brand">{progress}</Badge>} />
          {/* Safe server-reported stage only; no model output while work is in flight. */}
          <p role="status" className="text-sm text-muted">
            {progress}
          </p>
        </Card>
      )}

      {outcome && <OutcomeNotice outcome={outcome} />}

      {/* Rendered only when the gateway released a checked result. */}
      {outcome?.showsResult && result && (
        <Card>
          <CardHeader title="Checked answer" />
          <p className="whitespace-pre-wrap text-sm text-fg">{result.answer}</p>
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-fg">Sources</h3>
            {citations.length === 0 ? (
              <p className="text-sm text-muted">This answer cites no sources. Treat it as unsupported.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {citations.map((c) => (
                  <li key={c.key} className="text-sm text-muted">
                    {c.display}
                  </li>
                ))}
              </ul>
            )}
            {rejectedCitations && (
              <p className="mt-2 text-sm text-danger">
                Some citations were outside the permitted set and are not shown.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
