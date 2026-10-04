/*
 * Act mode: narrowing of the final `/actions` payload and the notice it maps to.
 *
 * Only fixed sentences, the decision, reason codes and trace ids are used. The request text and any
 * client field values are never echoed, and nothing is rendered as an answer.
 */
import type { ApiResponse } from "@/shared/contracts";
import type { GatewayOutcome } from "./envelope";

export type ActResult = {
  action: "create" | "update" | "delete" | "none";
  clientId: string | null;
  clientTraceId: string | null;
};

const ACTIONS = new Set(["create", "update", "delete", "none"]);
const strOrNull = (v: unknown) =>
  typeof v === "string" ? v : v === null || v === undefined ? null : undefined;

/** Narrow to `{action, client_id, client_trace_id}`; anything else (a chat answer, a run) is null. */
export function readActResult(data: ApiResponse["data"]): ActResult | null {
  const o: unknown = data;
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const { action, client_id, client_trace_id } = o as Record<string, unknown>;
  const clientId = strOrNull(client_id);
  const clientTraceId = strOrNull(client_trace_id);
  if (
    typeof action !== "string" ||
    !ACTIONS.has(action) ||
    clientId === undefined ||
    clientTraceId === undefined
  )
    return null;
  return { action: action as ActResult["action"], clientId, clientTraceId };
}

export type ActNoticeView = {
  decision: "ALLOW" | "REVIEW" | "BLOCK";
  title: string;
  detail: string;
};

const DONE: Record<ActResult["action"], string> = {
  create: "Done: client created",
  update: "Done: client updated",
  delete: "Done: client deleted",
  none: "Done: nothing needed to change",
};

// ponytail: patterns until the act backend publishes its reason codes; match exact codes once merged.
const HELD: [RegExp, string][] = [
  [/role_limit/, "The change exceeds your role's limit, so a second person must approve it."],
  [/destructive/, "Destructive actions need a second person to approve them. Nothing was deleted."],
  [
    /client_not_found|ambiguous|identif|unknown_client/,
    "The gateway could not identify the client, so nothing changed.",
  ],
  [/unclear|understand|intent|parse/, "The gateway could not understand the request, so nothing changed."],
];

/** The Act notice for a decided outcome, or null when the outcome carries no decision (errors, progress). */
export function describeAct(outcome: GatewayOutcome, act: ActResult | null): ActNoticeView | null {
  const { decision, reasons } = outcome;
  if (decision === "ALLOW")
    return {
      decision,
      title: DONE[act?.action ?? "none"],
      detail: "The gateway checked and recorded the change.",
    };
  if (decision === "REVIEW")
    return {
      decision,
      title: "Held for approval",
      detail:
        HELD.find(([re]) => reasons.some((r) => re.test(r)))?.[1] ??
        "A second person must approve this request. Nothing has changed yet.",
    };
  if (decision === "BLOCK")
    return { decision, title: "Blocked", detail: "The gateway refused this request. Nothing changed." };
  return null;
}
