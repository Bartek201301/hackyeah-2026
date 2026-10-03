"use client";

/*
 * W3 administrator review.
 *
 * Scope is the `Review` contract as it stands (B8, answered by Bartosz): candidate text,
 * classification, status, document id and version. DESIGN also asks for the findings and the
 * original locator; that projection may arrive in T07, so this screen states their absence instead
 * of inventing them — a fabricated locator would be worse than a missing one.
 *
 * A decision is a compare-and-swap against the version that was loaded. A 409 means someone else
 * moved the head, so the review is reloaded rather than resubmitted: resubmitting the same expected
 * version would defeat the check the gateway is making.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { createGatewayClient, newIdempotencyKey, readEnvelope } from "@/shared/contracts/client";
import type { ApiResponse, Review } from "@/shared/contracts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import { canonicalInput, keyForAction, type ActionKey } from "../lib/idempotency";
import {
  CLASSIFICATION_LABELS,
  MAX_CANDIDATE,
  MAX_REASON,
  STATUS_LABELS,
  draftFromReview,
  isResolvable,
  readReview,
  readReviewList,
  validateReview,
  type Classification,
  type ReviewAction,
  type ReviewDraft,
  type ReviewField,
} from "../lib/review";
import { OutcomeNotice } from "./OutcomeNotice";

const client = createGatewayClient();

const classify = (status: number, body: ApiResponse | null): GatewayOutcome =>
  classifyTerminalErrorCode(body) ?? classifyResponse(status, body);

const statusTone = (status: Review["status"]) =>
  status === "approved" ? "success" : status === "pending" ? "warning" : "neutral";

export function ReviewPanel() {
  const [list, setList] = useState<Review[] | null>(null);
  const [listOutcome, setListOutcome] = useState<GatewayOutcome | null>(null);
  const [selected, setSelected] = useState<Review | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ReviewField, string>>>({});
  const [decisionOutcome, setDecisionOutcome] = useState<GatewayOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  /** One key per decision; the same decision retried keeps it, a changed one mints a new key. */
  const actionKey = useRef<ActionKey | null>(null);

  /* Fetching stays free of setState so the effect applies results in a callback. */
  const fetchList = useCallback(async () => {
    const { status, body } = readEnvelope(await client.GET("/reviews", {}));
    const outcome = classify(status, body);
    if (outcome.kind !== "result") return { items: null, outcome };
    return { items: readReviewList(body?.data ?? null), outcome: null };
  }, []);

  const applyList = useCallback((next: Awaited<ReturnType<typeof fetchList>>) => {
    setList(next.items);
    setListOutcome(next.outcome);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchList().then((next) => {
      if (active) applyList(next);
    });
    return () => {
      active = false;
    };
  }, [fetchList, applyList]);

  /** Read one candidate. The list carries the same fields, but a fresh read is the current head. */
  const open = async (id: string) => {
    setDecisionOutcome(null);
    setErrors({});
    const { status, body } = readEnvelope(await client.GET("/reviews/{id}", { params: { path: { id } } }));
    const outcome = classify(status, body);
    if (outcome.kind !== "result") {
      setSelected(null);
      setDraft(null);
      setDecisionOutcome(outcome);
      return;
    }
    const review = readReview(body?.data ?? null);
    setSelected(review);
    setDraft(review ? draftFromReview(review) : null);
    if (!review) setDecisionOutcome(classifyResponse(200, null));
  };

  const submit = async (action: ReviewAction) => {
    if (!selected || !draft) return;
    const validation = validateReview(selected, draft, action);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setBusy(true);

    actionKey.current = keyForAction(
      actionKey.current,
      canonicalInput({
        review: selected.id,
        version: validation.body.expected_version,
        action,
        text: validation.body.candidate_text,
        classification: validation.body.classification,
        reason: validation.body.reason,
      }),
      newIdempotencyKey,
    );

    const { status, body } = readEnvelope(
      await client.PUT("/reviews/{id}", {
        params: { path: { id: selected.id }, header: { "Idempotency-Key": actionKey.current.key } },
        body: validation.body,
      }),
    );
    const outcome = classify(status, body);
    setDecisionOutcome(outcome);
    setBusy(false);

    if (outcome.kind === "result") {
      const resolved = readReview(body?.data ?? null);
      if (resolved) {
        setSelected(resolved);
        setDraft(draftFromReview(resolved));
      }
    }
    // A conflict means the head moved: reload rather than resubmit the same expected version.
    if (outcome.kind === "conflict") void open(selected.id);
    void fetchList().then(applyList);
  };

  const set = (field: ReviewField, value: string) =>
    setDraft((d) => (d === null ? d : { ...d, [field]: value }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Candidates held for review"
          description="Administrators only. Approving publishes the edited extract at its audience; rejecting keeps it withheld. Both are recorded against the exact version you loaded."
        />
        {listOutcome ? (
          <OutcomeNotice outcome={listOutcome} />
        ) : list === null ? (
          <p className="text-sm text-muted">Loading candidates…</p>
        ) : list.length === 0 ? (
          <EmptyState
            title="Nothing is waiting for review"
            description="Held candidates appear here when the gateway withholds content for a human decision."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item.id)}
                  aria-current={selected?.id === item.id ? "true" : undefined}
                  className="flex w-full flex-wrap items-center gap-3 rounded-control border border-border px-3.5 py-3 text-left text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[current]:border-brand"
                >
                  <Badge tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge>
                  <Badge tone="neutral">{CLASSIFICATION_LABELS[item.classification]}</Badge>
                  <span className="text-muted">Version {item.version}</span>
                  <span className="text-muted">Document {item.document_id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && draft && (
        <Card>
          <CardHeader
            title="Decide this candidate"
            description="The gateway rejects a decision unless the expected version still matches the current head."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(selected.status)}>{STATUS_LABELS[selected.status]}</Badge>
                <Badge tone="brand">Version {selected.version}</Badge>
              </div>
            }
          />
          <div className="flex flex-col gap-4">
            {/* Named gap, not a silent omission: the contract publishes neither finding nor locator. */}
            <Notice tone="info">
              This response carries no findings and no original locator, so neither is shown. Supporting
              excerpt ids are not published by any endpoint either, so this decision is submitted with none
              attached.
            </Notice>

            <Field
              label="Edited extract"
              hint={`${draft.candidateText.trim().length} of ${MAX_CANDIDATE} characters. What you approve is what may be published.`}
              error={errors.candidateText}
            >
              <Textarea
                value={draft.candidateText}
                onChange={(e) => set("candidateText", e.target.value)}
                maxLength={MAX_CANDIDATE}
                disabled={busy || !isResolvable(selected)}
              />
            </Field>

            <Field
              label="Audience"
              hint="The audience this extract may be shown to if approved."
              error={errors.classification}
            >
              <Select
                value={draft.classification}
                onChange={(e) => set("classification", e.target.value as Classification)}
                disabled={busy || !isResolvable(selected)}
              >
                {(Object.keys(CLASSIFICATION_LABELS) as Classification[]).map((value) => (
                  <option key={value} value={value}>
                    {CLASSIFICATION_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Reason"
              hint={`Recorded with the decision in the audit trail. ${draft.reason.trim().length} of ${MAX_REASON} characters.`}
              error={errors.reason}
            >
              <Input
                value={draft.reason}
                onChange={(e) => set("reason", e.target.value)}
                maxLength={MAX_REASON}
                disabled={busy || !isResolvable(selected)}
                placeholder="Why this is approved or rejected"
              />
            </Field>

            {isResolvable(selected) ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void submit("approve")} loading={busy} disabled={busy}>
                  <Check className="size-4" aria-hidden />
                  Approve at version {selected.version}
                </Button>
                <Button variant="secondary" onClick={() => void submit("reject")} disabled={busy}>
                  <X className="size-4" aria-hidden />
                  Reject
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                This candidate is {STATUS_LABELS[selected.status].toLowerCase()}, so it can no longer be
                decided here.
              </p>
            )}
          </div>
        </Card>
      )}

      {decisionOutcome && <OutcomeNotice outcome={decisionOutcome} />}
    </div>
  );
}
