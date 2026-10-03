import "client-only";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/shared/env";

/*
 * Supabase client for the browser. Use it ONLY for things that must happen
 * in the browser: realtime (subscriptions) and file uploads to Storage.
 * Regular reads -> queries.ts (server), writes -> actions.ts (Server Action).
 */
export function createSupabaseBrowser() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
