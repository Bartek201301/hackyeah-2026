import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/shared/env";

/*
 * Privileged gateway client: bypasses RLS, so only src/shared/gateway/repository.ts imports it and every
 * query there filters by actor and organisation explicitly. The key is read lazily, so the build needs none.
 * Errors name the variable, never its value.
 */
export function createSupabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret?.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY is missing or invalid");
  return createClient(getSupabaseEnv().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
