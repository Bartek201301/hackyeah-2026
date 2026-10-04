import type { ActorContext } from "@/shared/contracts";
import { PageHeader } from "@/shared/ui";
import { ChatPanel } from "./ChatPanel";
import { ExportPanel } from "./ExportPanel";
import { ReviewPanel } from "./ReviewPanel";
import { FeedPanel } from "./FeedPanel";
import { PolicyPanel } from "./PolicyPanel";
import { SourcesPanel } from "./SourcesPanel";
import { VIEW_DESCRIPTIONS, VIEW_LABELS, parseView, resolveView } from "../lib/views";

/*
 * Workbench shell. Server component: only the panels are interactive, so the client bundle covers
 * the interaction and nothing else.
 *
 * One route, view chosen by search parameter — the same approach the audit feature uses, because
 * `src/app` is integrator-owned and adding route segments is not this feature's to do.
 */
type WorkbenchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  /**
   * Signed-in role, for display only, supplied by the app page.
   *
   * This feature performs no auth call of its own: identity, cookies and permissions belong to the
   * app and the gateway. `undefined` means the role was not passed, and every view stays visible —
   * hiding a link is presentation, never a control, and the gateway checks each call regardless.
   */
  role?: ActorContext["role"];
  /**
   * Deal ids the signed-in actor is assigned to, from the app page. Narrows scope on an upload; it
   * cannot grant access. Labels are not available yet (`public.deals` is not readable by
   * `authenticated`), so these render as identifiers until a server-side projection exists — B6.
   */
  dealIds?: readonly string[];
};

export async function WorkbenchPage({ searchParams, role, dealIds }: WorkbenchPageProps) {
  const params = (await searchParams) ?? {};
  // A non-admin who types an admin-only view lands on Ask, rather than on a screen that refuses itself.
  const view = resolveView(parseView(params.view), role);

  return (
    /* One reading column for every view, so a page title and the panel under it share an axis.
       Centring each panel instead left the header stranded at the far edge of the content area. */
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      {/* Ask is a conversation, so it opens with its own greeting instead of a page title. Every
          other view is a form or a list and keeps the header, now that the only navigation is the
          app sidebar. */}
      {view !== "chat" && <PageHeader title={VIEW_LABELS[view]} description={VIEW_DESCRIPTIONS[view]} />}

      {view === "chat" && <ChatPanel role={role} />}
      {view === "sources" && <SourcesPanel dealIds={dealIds} />}
      {view === "policy" && (
        <div className="flex flex-col gap-6">
          <PolicyPanel />
          <FeedPanel />
        </div>
      )}

      {view === "review" && <ReviewPanel />}

      {view === "export" && <ExportPanel dealIds={dealIds} />}
    </div>
  );
}
