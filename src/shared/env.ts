import { validateSupabaseConfig } from "./supabase-config.mjs";

// Leniwy odczyt: build nie wymaga kluczy. NEXT_PUBLIC musi być odczytane dosłownie.
export function getSupabaseEnv() {
  return validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
