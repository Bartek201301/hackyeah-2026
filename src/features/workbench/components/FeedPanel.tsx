"use client";

/*
 * W4 threat-feed administration.
 *
 * Indicators are declarative signatures managed outside the gateway. Installing a version is a
 * compare-and-swap against the current head; an expired feed withholds protected operations until a
 * valid one is installed, so the expiry is shown prominently rather than buried.
 *
 * The resolved UTC instant is printed beside each time field, because a `datetime-local` control
 * carries no zone and the administrator must see the instant actually being submitted.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { createGatewayClient, newIdempotencyKey } from "@/shared/contracts/client";
import type { ApiResponse, ThreatFeed } from "@/shared/contracts";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select } from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import {
  CATEGORY_LABELS,
  EMPTY_INDICATOR,
  FEED_ACTIONS,
  FEED_CATEGORIES,
  FEED_KINDS,
  MAX_INDICATORS,
  draftFromFeed,
  emptyFeedDraft,
  feedSubmissionVersions,
  resolveInstant,
  validateFeedDraft,
  type FeedDraft,
  type IndicatorErrors,
} from "../lib/feedForm";
import { isFeedExpired } from "../lib/policyForm";
import { OutcomeNotice } from "./OutcomeNotice";

const client = createGatewayClient();

const envelopeOf = (data: unknown, error: unknown): ApiResponse | null =>
  ((data ?? error) as ApiResponse | undefined) ?? null;

const classify = (status: number, body: ApiResponse | null): GatewayOutcome =>
  classifyTerminalErrorCode(body) ?? classifyResponse(status, body);

type FieldErrors = Partial<Record<"source" | "publishedAt" | "expiresAt" | "indicators", string>>;

export function FeedPanel() {
  const [head, setHead] = useState<ThreatFeed | null>(null);
  const [loadOutcome, setLoadOutcome] = useState<GatewayOutcome | null>(null);
  const [draft, setDraft] = useState<FeedDraft>(emptyFeedDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [rowErrors, setRowErrors] = useState<Record<number, IndicatorErrors>>({});
  const [pushOutcome, setPushOutcome] = useState<GatewayOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchFeed = useCallback(async () => {
    const { data, error, response } = await client.GET("/feeds", {});
    const body = envelopeOf(data, error);
    const outcome = classify(response.status, body);
    if (outcome.kind !== "result") return { feed: null, outcome };
    const raw: unknown = body?.data ?? null;
    const feed =
      typeof raw === "object" && raw !== null && "feed" in raw
        ? ((raw as { feed: ThreatFeed }).feed ?? null)
        : null;
    return { feed, outcome: null };
  }, []);

  const applyFeed = useCallback((next: Awaited<ReturnType<typeof fetchFeed>>) => {
    setHead(next.feed);
    setLoadOutcome(next.outcome);
    if (next.feed) setDraft(draftFromFeed(next.feed));
  }, []);

  useEffect(() => {
    let active = true;
    void fetchFeed().then((next) => {
      if (active) applyFeed(next);
    });
    return () => {
      active = false;
    };
  }, [fetchFeed, applyFeed]);

  const setRow = (index: number, key: keyof typeof EMPTY_INDICATOR, value: string) =>
    setDraft((d) => ({
      ...d,
      indicators: d.indicators.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));

  const addRow = () => setDraft((d) => ({ ...d, indicators: [...d.indicators, { ...EMPTY_INDICATOR }] }));

  const removeRow = (index: number) =>
    setDraft((d) => ({ ...d, indicators: d.indicators.filter((_, i) => i !== index) }));

  const push = async () => {
    const { expected_version, version } = feedSubmissionVersions(head?.version ?? null);
    const validation = validateFeedDraft(draft, { version });
    if (!validation.ok) {
      setErrors(validation.errors);
      setRowErrors(validation.indicatorErrors);
      return;
    }
    setErrors({});
    setRowErrors({});
    setBusy(true);
    const { data, error, response } = await client.POST("/feeds", {
      body: { expected_version, feed: validation.feed },
      params: { header: { "Idempotency-Key": newIdempotencyKey() } },
    });
    const outcome = classify(response.status, envelopeOf(data, error));
    setPushOutcome(outcome);
    setBusy(false);
    // A conflict means the head moved: reload rather than resubmit the same expected version.
    if (outcome.kind === "conflict" || outcome.kind === "result") {
      void fetchFeed().then(applyFeed);
    }
  };

  const expired = head ? isFeedExpired(head.expires_at) : null;
  const publishedUtc = resolveInstant(draft.publishedAt);
  const expiresUtc = resolveInstant(draft.expiresAt);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Installed threat feed"
          actions={head ? <Badge tone="brand">Version {head.version}</Badge> : undefined}
        />
        {loadOutcome ? (
          <OutcomeNotice outcome={loadOutcome} />
        ) : head === null ? (
          <p className="text-sm text-muted">No feed is installed. Pushing one creates version 1.</p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-fg">
              {head.source} — {head.indicators.length} indicator
              {head.indicators.length === 1 ? "" : "s"}
            </p>
            <p className="text-muted">
              Published {head.published_at} · expires {head.expires_at}
            </p>
            {expired && (
              <Notice tone="danger">
                This feed has expired. Protected operations stay withheld until a valid new version is
                installed.
              </Notice>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Push a new version"
          description="Administrators only. The gateway validates the document and refuses it if the expected version is not the current head."
        />
        <div className="flex flex-col gap-4">
          <Field label="Source" error={errors.source}>
            <Input
              value={draft.source}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
              placeholder="Who publishes this feed"
              disabled={busy}
            />
          </Field>

          <Field
            label="Published at"
            hint={publishedUtc ? `Submitted as ${publishedUtc}` : "Local time; shown in UTC once valid."}
            error={errors.publishedAt}
          >
            <Input
              type="datetime-local"
              value={draft.publishedAt}
              onChange={(e) => setDraft((d) => ({ ...d, publishedAt: e.target.value }))}
              disabled={busy}
            />
          </Field>

          <Field
            label="Expires at"
            hint={expiresUtc ? `Submitted as ${expiresUtc}` : "Must be in the future."}
            error={errors.expiresAt}
          >
            <Input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))}
              disabled={busy}
            />
          </Field>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-fg">
              Indicators ({draft.indicators.length} of {MAX_INDICATORS})
            </h3>
            {errors.indicators && <Notice tone="danger">{errors.indicators}</Notice>}

            {draft.indicators.map((row, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-control border border-border bg-surface-muted p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Id" error={rowErrors[index]?.id}>
                    <Input
                      value={row.id}
                      onChange={(e) => setRow(index, "id", e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <Field label="Kind" error={rowErrors[index]?.kind}>
                    <Select
                      value={row.kind}
                      onChange={(e) => setRow(index, "kind", e.target.value)}
                      disabled={busy}
                    >
                      {FEED_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Value"
                    hint={
                      row.kind === "domain" ? "Hostname syntax; the gateway never fetches it." : undefined
                    }
                    error={rowErrors[index]?.value}
                  >
                    <Input
                      value={row.value}
                      onChange={(e) => setRow(index, "value", e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <Field label="Category" error={rowErrors[index]?.category}>
                    <Select
                      value={row.category}
                      onChange={(e) => setRow(index, "category", e.target.value)}
                      disabled={busy}
                    >
                      {FEED_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Action" error={rowErrors[index]?.action}>
                    <Select
                      value={row.action}
                      onChange={(e) => setRow(index, "action", e.target.value)}
                      disabled={busy}
                    >
                      {FEED_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Description" error={rowErrors[index]?.description}>
                    <Input
                      value={row.description}
                      onChange={(e) => setRow(index, "description", e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                </div>
                {draft.indicators.length > 1 && (
                  <div>
                    <Button variant="secondary" size="sm" onClick={() => removeRow(index)} disabled={busy}>
                      <Trash2 className="size-4" aria-hidden />
                      Remove indicator {index + 1}
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={addRow}
                disabled={busy || draft.indicators.length >= MAX_INDICATORS}
              >
                <Plus className="size-4" aria-hidden />
                Add indicator
              </Button>
              <Button onClick={() => void push()} loading={busy} disabled={busy}>
                <Send className="size-4" aria-hidden />
                Push version {feedSubmissionVersions(head?.version ?? null).version}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {pushOutcome && <OutcomeNotice outcome={pushOutcome} />}
    </div>
  );
}
