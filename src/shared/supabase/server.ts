import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/shared/env";

/*
 * Klient Supabase dla kodu serwerowego: komponenty serwerowe (queries.ts)
 * i Server Actions (actions.ts). To jest DOMYŚLNY klient — używaj go wszędzie,
 * gdzie się da. Import w komponencie z "use client" zakończy build błędem.
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
          // Wywołane z komponentu serwerowego, gdzie nie można ustawiać ciasteczek.
          // Bez logowania nie ma tu czego zapisywać, więc bezpiecznie pomijamy.
        }
      },
    },
  });
}
