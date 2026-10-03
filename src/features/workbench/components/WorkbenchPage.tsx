import { EmptyState, PageHeader } from "@/shared/ui";
import { meta } from "../meta";

/* Placeholder screen until the owning builder starts after G1. */
export function WorkbenchPage() {
  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      <EmptyState
        title="Not built yet"
        description="Workbench — chat, sources and review. Built by Builder A after G1."
      />
    </>
  );
}
