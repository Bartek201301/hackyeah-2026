/*
 * In-page view switching.
 *
 * `src/app` is integrator-owned and the workbench has one route, so the view is chosen by search
 * parameter. This follows the precedent the audit feature set: one route per feature, the view
 * selected by `?trace=`, so a link can target a view without a new route segment.
 */

import type { ActorContext } from "@/shared/contracts";

export const WORKBENCH_VIEWS = ["chat", "sources", "review", "policy", "export"] as const;
export type WorkbenchView = (typeof WORKBENCH_VIEWS)[number];

export const DEFAULT_VIEW: WorkbenchView = "chat";

const isView = (v: string): v is WorkbenchView => (WORKBENCH_VIEWS as readonly string[]).includes(v);

/**
 * Read the requested view from a Next search-parameter value. Anything unrecognised — absent,
 * misspelled, or repeated — falls back to chat rather than erroring.
 */
export function parseView(raw: string | string[] | undefined): WorkbenchView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && isView(value) ? value : DEFAULT_VIEW;
}

export const VIEW_LABELS: Record<WorkbenchView, string> = {
  chat: "Ask",
  sources: "Sources and import",
  review: "Review",
  policy: "Policy and feed",
  export: "Public summary",
};

export const VIEW_DESCRIPTIONS: Record<WorkbenchView, string> = {
  chat: "Ask a governed question and see the decision, the checked answer and its sources.",
  sources: "Register a source or upload one CSV or text PDF, then see the import outcome.",
  review: "Administrators approve or reject a held candidate at an exact version.",
  policy: "Administrators read and update the central policy and threat feed.",
  export: "Request a public summary and download its checked PDF.",
};

/**
 * Views whose endpoints are admin-only. Used to hide links, which is presentation, never a control:
 * the gateway checks the actor on every call regardless of what the nav shows.
 */
export const ADMIN_ONLY_VIEWS: readonly WorkbenchView[] = ["review", "policy"];

export const isAdminOnlyView = (view: WorkbenchView): boolean => ADMIN_ONLY_VIEWS.includes(view);

/**
 * Whether to show admin-only links, from a role the app page passes in purely for display.
 *
 * This feature makes no auth call of its own: identity, cookies and permissions belong to the app
 * and the gateway. An absent role shows everything, because a missing prop must not strip an
 * administrator's controls — and hiding a link was never a control in the first place.
 */
export function shouldShowAdminViews(role: ActorContext["role"] | undefined): boolean {
  return role === undefined || role === "admin";
}

/** Chat is the canonical view, so it gets the bare path rather than `?view=chat`. */
export function viewHref(view: WorkbenchView): string {
  return view === DEFAULT_VIEW ? "/workbench" : `/workbench?view=${view}`;
}
