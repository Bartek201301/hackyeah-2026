import WorkbenchPage from "@/features/workbench";
import { getActor } from "@/shared/auth/actor";

// Role and deals are presentation only; the gateway authorizes every call. An unavailable
// identity read (getActor throws) leaves every view visible rather than failing the page.
export default async function Page({ searchParams }: PageProps<"/workbench">) {
  const actor = await getActor().catch(() => null);
  return <WorkbenchPage searchParams={searchParams} role={actor?.role} dealIds={actor?.deal_ids} />;
}
