import { Card, CardHeader, EmptyState, PageHeader } from "@/shared/ui";
import { getActor } from "@/shared/auth/actor";
import { ChatPanel } from "./ChatPanel";
import { FeedPanel } from "./FeedPanel";
import { PolicyPanel } from "./PolicyPanel";
import { SourcesPanel } from "./SourcesPanel";
import { WorkbenchNav } from "./WorkbenchNav";
import { VIEW_DESCRIPTIONS, VIEW_LABELS, parseView } from "../lib/views";

/*
 * Workbench shell. Server component: only the panels are interactive, so the client bundle covers
 * the interaction and nothing else.
 *
 * One route, view chosen by search parameter — the same approach the audit feature uses, because
 * `src/app` is integrator-owned and adding route segments is not this feature's to do.
 */
type WorkbenchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export async function WorkbenchPage({ searchParams }: WorkbenchPageProps) {
  const params = (await searchParams) ?? {};
  const view = parseView(params.view);

  /*
   * Role drives presentation only. Hiding a link is not authorization: every route the panels call
   * is checked server-side regardless of what is shown. When the role cannot be read the admin
   * views stay visible, because a failed membership read must not strip an administrator's
   * controls — the gateway still denies everyone else.
   */
  let isAdmin = true;
  try {
    const actor = await getActor();
    if (actor) isAdmin = actor.role === "admin";
  } catch {
    isAdmin = true;
  }

  return (
    <>
      <PageHeader title={VIEW_LABELS[view]} description={VIEW_DESCRIPTIONS[view]} />
      <WorkbenchNav active={view} showAdminViews={isAdmin} />

      {view === "chat" && <ChatPanel />}
      {view === "sources" && <SourcesPanel />}
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
