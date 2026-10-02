import "client-only";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/shared/env";

/*
 * Klient Supabase dla przeglądarki. Używaj TYLKO do rzeczy, które muszą dziać się
 * w przeglądarce: realtime (subskrypcje) i upload plików do Storage.
 * Zwykłe odczyty -> queries.ts (serwer), zapisy -> actions.ts (Server Action).
 */
export function createSupabaseBrowser() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
