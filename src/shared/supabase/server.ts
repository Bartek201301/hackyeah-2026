import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/shared/env";

/*
 * Supabase client for server code: server components (queries.ts)
 * and Server Actions (actions.ts). This is the DEFAULT client — use it wherever
 * you can. Importing it in a "use client" component fails the build.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies cannot be set.
          // Without sign-in there is nothing to save here, so we safely skip it.
        }
      },
    },
  });
}
