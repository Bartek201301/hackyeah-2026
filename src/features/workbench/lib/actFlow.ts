/*
 * Act mode: narrowing of the final `/actions` payload and the notice it maps to.
 *
 * Only fixed sentences, the decision, reason codes and trace ids are used. The request text and any
 * client field values are never echoed, and nothing is rendered as an answer.
 */
import type { ApiResponse } from "@/shared/contracts";
import type { GatewayOutcome } from "./envelope";

/*
 * Which flow one chat message goes to. UX only: the gateway enforces the same rules on either path,
 * and an Act run that finds nothing to do falls back to Ask in the panel.
 */
const word = (alternatives: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, "iu");
const VERB = word(
  "add|create|register|onboard|update|change|set|raise|increase|lower|reduce|cut|delete|remove|pause|activate|" +
    "dodaj|utwórz|zmień|ustaw|podnieś|zwiększ|obniż|zmniejsz|usuń|skasuj|wstrzymaj",
);
const RECORD = word("clients?|fee|annual fee|status|sector|klient\\p{L}*|opłat\\p{L}*|sektor");
// "Delete Northwind Advisory": a removal verb followed by a capitalised name is a client action too.
const REMOVE_NAME = /(?<![\p{L}\p{N}_])(?:delete|remove|usuń|skasuj)\s+(\S)/giu;

export function routeMessage(text: string): "act" | "ask" {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return "ask";
  const sentences = trimmed.split(/[.!?;\n]+/);
  if (sentences.some((s) => VERB.test(s) && RECORD.test(s))) return "act";
  return [...trimmed.matchAll(REMOVE_NAME)].some((m) => /\p{Lu}/u.test(m[1])) ? "act" : "ask";
}

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

/** The act backend's REVIEW reason codes (src/shared/gateway), in plain English. */
const HELD: Record<string, string> = {
  "action:change_exceeds_role_limit":
    "The change exceeds your role's limit, so a second person must approve it.",
  "action:destructive_requires_approval":
    "Destructive actions need a second person to approve them. Nothing was deleted.",
  "action:client_not_resolved": "The gateway could not identify the client, so nothing changed.",
  "action:unparsed": "The gateway could not understand the request, so nothing changed.",
};

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
        reasons.map((r) => HELD[r]).find(Boolean) ??
        "A second person must approve this request. Nothing has changed yet.",
    };
  if (decision === "BLOCK")
    return { decision, title: "Blocked", detail: "The gateway refused this request. Nothing changed." };
  return null;
}
