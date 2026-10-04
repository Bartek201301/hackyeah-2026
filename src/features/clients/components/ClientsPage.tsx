import { PageHeader } from "@/shared/ui";
import { meta } from "../meta";
import { ClientsPanel } from "./ClientsPanel";

/* Server shell; the panel is the only interactive part. */
export function ClientsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader title={meta.title} description={meta.description} />
      <ClientsPanel />
    </div>
  );
}
