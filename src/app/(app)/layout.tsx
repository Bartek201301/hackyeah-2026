import { unstable_rethrow } from "next/navigation";
import { getActor } from "@/shared/auth/actor";
import type { ActorContext } from "@/shared/contracts";
import { AppShell } from "@/shared/layout/AppShell";
import { APP_NAME, adminNav, nav } from "../nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Role is for display only; a failed lookup just hides it.
  let role: ActorContext["role"] | undefined;
  try {
    role = (await getActor())?.role;
  } catch (error) {
    unstable_rethrow(error);
  }
  return (
    <AppShell appName={APP_NAME} nav={nav} adminNav={adminNav} role={role}>
      {children}
    </AppShell>
  );
}
