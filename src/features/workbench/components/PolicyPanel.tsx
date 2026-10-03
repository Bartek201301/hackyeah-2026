"use client";

/*
 * W4 policy and threat feed administration.
 *
 * The form is generated from the loaded document, not from a hardcoded field list and never from
 * docs/contracts/policy.example.json — that file owns *initial* values and copying them here would
 * create a second source of defaults.
 *
 * Client-side invariant messages are hints. The gateway validates and decides
 * (technical-spec §5), and this screen must never become a second policy engine.
 *
 * `semantic.required` is rendered as fixed text, not a control. DESIGN forbids any toggle that
 * bypasses required assessment, access checks or budgets.
 */

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { createGatewayClient, newIdempotencyKey } from "@/shared/contracts/client";
import type { ApiResponse, GatewayPolicy } from "@/shared/contracts";
import { Badge, Button, Card, CardHeader, Field, Input, Notice } from "@/shared/ui";
import { classifyResponse, classifyTerminalErrorCode, type GatewayOutcome } from "../lib/envelope";
import { POLICY_SECTIONS, checkPolicyInvariants, nextPolicyVersion, type Invariant } from "../lib/policyForm";
import { OutcomeNotice } from "./OutcomeNotice";

const client = createGatewayClient();

const envelopeOf = (data: unknown, error: unknown): ApiResponse | null =>
  ((data ?? error) as ApiResponse | undefined) ?? null;

const classify = (status: number, body: ApiResponse | null): GatewayOutcome =>
  classifyTerminalErrorCode(body) ?? classifyResponse(status, body);

type Row = { path: string; label: string; value: string | number | boolean | readonly string[] };

/** Flatten one policy section into labelled rows, descending one level for threshold groups. */
function rowsOf(section: Record<string, unknown>, prefix: string): Row[] {
  const rows: Row[] = [];
  for (const [key, value] of Object.entries(section)) {
    const path = `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      rows.push(...rowsOf(value as Record<string, unknown>, path));
    } else {
      rows.push({ path, label: key.replaceAll("_", " "), value: value as Row["value"] });
    }
  }
  return rows;
}

const problemFor = (problems: Invariant[], path: string): string | undefined =>
  problems.find((p) => path === p.path || path.startsWith(`${p.path}.`))?.message;

export function PolicyPanel() {
  const [policy, setPolicy] = useState<GatewayPolicy | null>(null);
  const [loadOutcome, setLoadOutcome] = useState<GatewayOutcome | null>(null);
  const [saveOutcome, setSaveOutcome] = useState<GatewayOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  /* Fetching is kept free of setState so the effect applies the result in a callback. */
  const fetchPolicy = useCallback(async () => {
    const { data, error, response } = await client.GET("/policy", {});
    const body = envelopeOf(data, error);
    const outcome = classify(response.status, body);
    if (outcome.kind !== "result") return { policy: null, outcome };
    const raw: unknown = body?.data ?? null;
    const loaded =
      typeof raw === "object" && raw !== null && "policy" in raw
        ? ((raw as { policy: GatewayPolicy }).policy ?? null)
        : null;
    return { policy: loaded, outcome: null };
  }, []);

  const applyPolicy = useCallback((next: Awaited<ReturnType<typeof fetchPolicy>>) => {
    setPolicy(next.policy);
    setLoadOutcome(next.outcome);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPolicy().then((next) => {
      if (active) applyPolicy(next);
    });
    return () => {
      active = false;
    };
  }, [fetchPolicy, applyPolicy]);

  const problems = policy ? checkPolicyInvariants(policy) : [];

  const save = async () => {
    if (!policy) return;
    setBusy(true);
    const { data, error, response } = await client.PUT("/policy", {
      body: { expected_version: nextPolicyVersion(policy.version), policy },
      params: { header: { "Idempotency-Key": newIdempotencyKey() } },
    });
    const outcome = classify(response.status, envelopeOf(data, error));
    setSaveOutcome(outcome);
    setBusy(false);
    // A conflict means someone else moved the head: reload rather than resubmit.
    if (outcome.kind === "conflict") void fetchPolicy().then(applyPolicy);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Central policy"
          description="Administrators only. Saving replaces the whole document and is rejected unless the expected version matches the current head."
          actions={policy ? <Badge tone="brand">Version {policy.version}</Badge> : undefined}
        />
        {loadOutcome ? (
          <div className="flex flex-col gap-4">
            <OutcomeNotice outcome={loadOutcome} />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">What this screen controls</h3>
              <ul className="flex flex-col gap-1.5 text-sm text-muted">
                {POLICY_SECTIONS.map((s) => (
                  <li key={s.key}>
                    <span className="font-medium text-fg">{s.title}</span> — {s.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : policy === null ? (
          <p className="text-sm text-muted">Loading the current policy…</p>
        ) : (
          <div className="flex flex-col gap-6">
            <Notice tone="info">
              Saving submits version {nextPolicyVersion(policy.version)}. The gateway validates every rule;
              the notes below are only a first check in the browser.
            </Notice>

            {POLICY_SECTIONS.map((section) => {
              const group = policy[section.key] as unknown;
              if (typeof group !== "object" || group === null) return null;
              return (
                <section key={section.key} className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-fg">{section.title}</h3>
                    <p className="text-sm text-muted">{section.description}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {rowsOf(group as Record<string, unknown>, section.key).map((row) => {
                      // Required assessment is stated, never offered as a switch.
                      if (row.path === "semantic.required") {
                        return (
                          <Field
                            key={row.path}
                            label="Semantic assessment"
                            hint="Required. This cannot be disabled."
                          >
                            <Input value="Required" readOnly disabled />
                          </Field>
                        );
                      }
                      const error = problemFor(problems, row.path);
                      const readOnly =
                        Array.isArray(row.value) ||
                        typeof row.value === "boolean" ||
                        row.path.endsWith(".version");
                      return (
                        <Field
                          key={row.path}
                          label={row.label}
                          hint={readOnly ? "Changed by the integrator, not here." : undefined}
                          error={error}
                        >
                          <Input
                            value={Array.isArray(row.value) ? row.value.join(", ") : String(row.value)}
                            readOnly={readOnly}
                            disabled={readOnly || busy}
                            inputMode={typeof row.value === "number" ? "numeric" : undefined}
                            onChange={(e) => {
                              const next = structuredClone(policy) as unknown as Record<
                                string,
                                Record<string, unknown>
                              >;
                              const keys = row.path.split(".");
                              let cursor: Record<string, unknown> = next;
                              for (const key of keys.slice(0, -1)) {
                                cursor = cursor[key] as Record<string, unknown>;
                              }
                              const leaf = keys[keys.length - 1]!;
                              cursor[leaf] =
                                typeof row.value === "number" ? Number(e.target.value) : e.target.value;
                              setPolicy(next as unknown as GatewayPolicy);
                            }}
                          />
                        </Field>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {problems.length > 0 && (
              <Notice tone="danger">
                <p className="font-semibold">These rules would be rejected</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {problems.map((p) => (
                    <li key={p.path}>{p.message}</li>
                  ))}
                </ul>
              </Notice>
            )}

            <div>
              <Button onClick={() => void save()} loading={busy} disabled={busy}>
                <Save className="size-4" aria-hidden />
                Save as version {nextPolicyVersion(policy.version)}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {saveOutcome && <OutcomeNotice outcome={saveOutcome} />}
    </div>
  );
}
