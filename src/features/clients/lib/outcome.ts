import type { ApiResponse } from "@/shared/contracts";

/*
 * Turns a gateway envelope into the notice shown after a client action. Only fixed sentences, the
 * decision, reason codes and the error code are used: nothing the user typed (names, notes) and no
 * server message text is echoed back.
 */

export type ClientOutcome = {
  decision: "ALLOW" | "REVIEW" | "BLOCK" | null;
  title: string;
  detail: string;
  reasons: string[];
  traceId: string | null;
};

const REVIEW_DETAIL: Record<string, string> = {
  "action:change_exceeds_role_limit":
    "The change exceeds your role's limit, so a second person must approve it. Nothing has changed yet.",
  "action:destructive_requires_approval":
    "Destructive actions need a second person to approve them. Nothing was deleted.",
};

export function describeOutcome(status: number, body: ApiResponse | null): ClientOutcome {
  if (!body)
    return {
      decision: null,
      title: "No answer from the gateway",
      detail: `The request failed (HTTP ${status}). Try again.`,
      reasons: [],
      traceId: null,
    };
  const base = { reasons: body.reasons ?? [], traceId: body.trace_id };
  if (body.decision === "ALLOW")
    return {
      ...base,
      decision: "ALLOW",
      title: "Saved",
      detail: "The gateway allowed and recorded the action.",
    };
  if (body.decision === "REVIEW")
    return {
      ...base,
      decision: "REVIEW",
      title: "Held for approval",
      detail:
        base.reasons.map((r) => REVIEW_DETAIL[r]).find(Boolean) ??
        "A second person must approve this action. Nothing has changed yet.",
    };
  if (body.decision === "BLOCK")
    return { ...base, decision: "BLOCK", title: "Blocked", detail: "The gateway refused this action." };
  const code = body.error?.code;
  return {
    ...base,
    decision: null,
    title: "Not saved",
    detail:
      code === "CONFLICT"
        ? "The client changed since the list loaded. Refresh and try again."
        : "The gateway did not complete the action.",
    reasons: code ? [...base.reasons, code] : base.reasons,
  };
}

export const traceHref = (traceId: string | null) =>
  traceId ? `/audit?trace=${encodeURIComponent(traceId)}` : null;
