import type { ActorContext } from "@/shared/contracts";
import { Card, CardHeader, EmptyState, PageHeader } from "@/shared/ui";
import { ChatPanel } from "./ChatPanel";
import { FeedPanel } from "./FeedPanel";
import { PolicyPanel } from "./PolicyPanel";
import { SourcesPanel } from "./SourcesPanel";
import { WorkbenchNav } from "./WorkbenchNav";
import { VIEW_DESCRIPTIONS, VIEW_LABELS, parseView, shouldShowAdminViews } from "../lib/views";

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

/* Review and export are not built: both wait on a contract decision, named here rather than
 * guessed at, so nobody mistakes an empty screen for a missing endpoint. */
const WAITING: Record<"review" | "export", { title: string; description: string }> = {
  review: {
    title: "Review is not built yet",
    description:
      "The review response carries candidate text, classification and status, but DESIGN also requires the findings and the original locator. That projection has to be agreed before this screen can show an administrator what they are approving.",
  },
  export: {
    title: "Public summary is not built yet",
    description:
      "A completed export returns a download path and an expiry. DESIGN also asks for the checked summary text and its citations, so whether those are exposed has to be agreed before this screen can preview anything.",
  },
};

export async function WorkbenchPage({ searchParams, role, dealIds }: WorkbenchPageProps) {
  const params = (await searchParams) ?? {};
  const view = parseView(params.view);

  const isAdmin = shouldShowAdminViews(role);

  return (
    <>
      <PageHeader title={VIEW_LABELS[view]} description={VIEW_DESCRIPTIONS[view]} />
      <WorkbenchNav active={view} showAdminViews={isAdmin} />

      {view === "chat" && <ChatPanel />}
      {view === "sources" && <SourcesPanel dealIds={dealIds} />}
      {view === "policy" && (
        <div className="flex flex-col gap-6">
          <PolicyPanel />
          <FeedPanel />
        </div>
      )}

      {(view === "review" || view === "export") && (
        <Card>
          <CardHeader title={WAITING[view].title} />
          <EmptyState title="Waiting on a contract decision" description={WAITING[view].description} />
        </Card>
      )}
    </>
  );
}
