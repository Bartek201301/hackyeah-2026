import { Card, CardHeader, Notice, PageHeader } from "@/shared/ui";
import { meta } from "../meta";
import { ChatPanel } from "./ChatPanel";

/*
 * Workbench shell. Server component: only ChatPanel is interactive, so the client bundle stays
 * limited to the chat interaction.
 *
 * Only the chat slice is built. Sources/import, review, policy/feed and export need their own
 * routes under src/app (integrator-owned) plus live endpoints; see Julian/plans/01-task-sequence.md.
 */
export function WorkbenchPage() {
  return (
    <>
      <PageHeader
        title={meta.title}
        description="Ask a governed question and see the gateway's decision, the checked answer and its sources."
      />
      <div className="flex flex-col gap-6">
        <ChatPanel />
        <Card>
          <CardHeader
            title="Not built yet"
            description="These screens need their routes and endpoints before they can do anything real."
          />
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            <li>Sources and import — upload a CSV or text PDF and see the import outcome.</li>
            <li>Review — administrators approve or reject a held candidate at an exact version.</li>
            <li>Policy and threat feed — administrators update central controls.</li>
            <li>Public summary — request a public PDF and download it.</li>
          </ul>
          <div className="mt-5">
            <Notice tone="info">
              Every gateway operation currently reports that it is unavailable. That is the fail-closed
              behaviour, not a missing screen: nothing is released until the real endpoints are in place.
            </Notice>
          </div>
        </Card>
      </div>
    </>
  );
}
