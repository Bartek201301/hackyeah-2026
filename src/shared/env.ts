import { validateSupabaseConfig } from "./supabase-config.mjs";

// Lazy read: the build does not need keys. NEXT_PUBLIC must be read literally.
export function getSupabaseEnv() {
  return validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
