"use client";

/*
 * Clients list and actions. Every control is shown to every role: the gateway decides, and hiding a
 * button is not authorization (the same rule as the audit ScopeControl). An employee who presses
 * Delete sees the BLOCK and its trace.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { newIdempotencyKey } from "@/shared/contracts/client";
import type { ApiResponse } from "@/shared/contracts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  Textarea,
} from "@/shared/ui";
import { describeOutcome, traceHref, type ClientOutcome } from "../lib/outcome";

type Client = {
  id: string;
  name: string;
  sector: string | null;
  status: string;
  created_at: string;
  annual_fee_usd?: number | null;
  version?: number;
};

// ponytail: plain fetch until the client API is merged; then swap to createGatewayClient + readEnvelope.
async function call(path: string, body?: unknown) {
  const post = body !== undefined;
  const res = await fetch(`/api/v1${path}`, {
    method: post ? "POST" : "GET",
    credentials: "same-origin",
    headers: post
      ? { "content-type": "application/json", "Idempotency-Key": newIdempotencyKey() }
      : undefined,
    body: post ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const json: unknown = await res?.json().catch(() => null);
  const envelope =
    typeof json === "object" && json !== null && typeof (json as ApiResponse).trace_id === "string"
      ? (json as ApiResponse)
      : null;
  return { status: res?.status ?? 0, body: envelope };
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
});
const DECISION_TONE = { ALLOW: "success", REVIEW: "warning", BLOCK: "danger" } as const;

function OutcomeNotice({ outcome }: { outcome: ClientOutcome }) {
  const href = traceHref(outcome.traceId);
  return (
    <Notice
      tone={outcome.decision === "ALLOW" ? "success" : outcome.decision === "REVIEW" ? "info" : "danger"}
    >
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {outcome.decision && <Badge tone={DECISION_TONE[outcome.decision]}>{outcome.decision}</Badge>}
          {outcome.title}
        </p>
        <p>{outcome.detail}</p>
        {outcome.reasons.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Reasons:</span>
            {outcome.reasons.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </p>
        )}
        {href ? (
          <Link href={href} className="font-semibold underline underline-offset-2">
            View the audited trace
          </Link>
        ) : (
          <p className="text-muted">No audit record is available for this attempt.</p>
        )}
      </div>
    </Notice>
  );
}

function ClientRow({ client, onDone }: { client: Client; onDone: () => void }) {
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState<"fee" | "delete" | null>(null);
  const [outcome, setOutcome] = useState<ClientOutcome | null>(null);
  const hasFee = "annual_fee_usd" in client;

  const act = async (kind: "fee" | "delete") => {
    setBusy(kind);
    setOutcome(null);
    const r =
      kind === "fee"
        ? await call(`/clients/${client.id}/update`, {
            // Roles without a version still get the server's verdict; it checks role before version.
            expected_version: client.version ?? 1,
            changes: { annual_fee_usd: Number(fee) },
          })
        : await call(`/clients/${client.id}/delete`, {});
    const next = describeOutcome(r.status, r.body);
    setOutcome(next);
    setBusy(null);
    if (next.decision === "ALLOW") {
      setFee("");
      onDone();
    }
  };

  const saveFee = (e: FormEvent) => {
    e.preventDefault();
    if (fee.trim() !== "") void act("fee");
  };

  return (
    <li className="flex flex-col gap-3 py-4 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-fg break-words">{client.name}</p>
          <p className="text-sm text-muted">
            {client.sector ?? "No sector"} · <Badge>{client.status}</Badge>
          </p>
        </div>
        {hasFee && (
          <p className="text-sm tabular-nums text-fg">
            {client.annual_fee_usd == null ? "No fee set" : `${usd.format(client.annual_fee_usd)} / year`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <form onSubmit={saveFee} className="flex flex-1 flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Field label="Change fee (USD per year)">
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                disabled={busy !== null}
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="secondary"
            loading={busy === "fee"}
            disabled={busy !== null || !fee.trim()}
          >
            Save
          </Button>
        </form>
        <Button
          variant="secondary"
          onClick={() => void act("delete")}
          loading={busy === "delete"}
          disabled={busy !== null}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      </div>
      {outcome && <OutcomeNotice outcome={outcome} />}
    </li>
  );
}

function AddClientForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", sector: "", fee: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ClientOutcome | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setOutcome(null);
    const r = await call("/clients", {
      name: form.name.trim(),
      ...(form.sector.trim() && { sector: form.sector.trim() }),
      ...(form.fee.trim() && { annual_fee_usd: Number(form.fee) }),
      ...(form.notes.trim() && { notes: form.notes.trim() }),
    });
    const next = describeOutcome(r.status, r.body);
    setOutcome(next);
    setBusy(false);
    if (next.decision === "ALLOW") {
      setForm({ name: "", sector: "", fee: "", notes: "" });
      onDone();
    }
  };

  return (
    <Card>
      <CardHeader title="Add client" description="The gateway checks your role and the text before saving." />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input value={form.name} onChange={set("name")} required maxLength={200} disabled={busy} />
        </Field>
        <Field label="Sector (optional)">
          <Input value={form.sector} onChange={set("sector")} maxLength={100} disabled={busy} />
        </Field>
        <Field label="Annual fee in USD (optional)">
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={form.fee}
            onChange={set("fee")}
            disabled={busy}
          />
        </Field>
        <Field label="Notes (optional)">
          <Textarea value={form.notes} onChange={set("notes")} maxLength={2000} disabled={busy} />
        </Field>
        <div>
          <Button type="submit" loading={busy} disabled={busy || !form.name.trim()}>
            <Plus className="size-4" aria-hidden />
            Add client
          </Button>
        </div>
        {outcome && <OutcomeNotice outcome={outcome} />}
      </form>
    </Card>
  );
}

export function ClientsPanel() {
  const [items, setItems] = useState<Client[] | null>(null);
  const [failure, setFailure] = useState<ClientOutcome | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof call>>) => {
    const list = (r.body?.data as { items?: Client[] } | null)?.items;
    const ok = r.status === 200 && Array.isArray(list);
    setItems(ok ? list : null);
    setFailure(ok ? null : describeOutcome(r.status, r.body));
  }, []);
  const load = useCallback(() => call("/clients").then(apply), [apply]);

  useEffect(() => {
    let active = true;
    void call("/clients").then((r) => {
      if (active) apply(r);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const showsFees = items?.some((c) => "annual_fee_usd" in c) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <AddClientForm onDone={() => void load()} />
      {/* The Card's own padding is the only padding; rows and states sit flush inside it. */}
      <Card>
        <CardHeader
          title="Client list"
          actions={
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </Button>
          }
        />
        {failure ? (
          <div className="flex flex-col gap-3">
            <ErrorState
              title="The client list is not available"
              description="The gateway did not return the list."
            />
            <OutcomeNotice outcome={failure} />
          </div>
        ) : items === null ? (
          <LoadingState label="Loading clients…" />
        ) : items.length === 0 ? (
          <EmptyState title="No clients yet" description="Add the first client with the form above." />
        ) : (
          <>
            {!showsFees && (
              <p className="pb-3 text-sm text-muted">Fees are visible to analysts and administrators.</p>
            )}
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {items.map((c) => (
                <ClientRow key={c.id} client={c} onDone={() => void load()} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
