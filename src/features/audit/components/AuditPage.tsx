import { EmptyState, PageHeader } from "@/shared/ui";
import { meta } from "../meta";

/* Placeholder screen until the owning builder starts after G1. */
export function AuditPage() {
  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      <EmptyState
        title="Not built yet"
        description="Audit — traces, usage and security reporting. Built by Builder C after G1."
      />
    </>
  );
}
