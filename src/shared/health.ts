import "server-only";
import { getSupabaseEnv } from "./env";
import { checkSupabaseConnection } from "./supabase-config.mjs";

export type HealthCheck = { name: string; ok: boolean; detail: string };

export async function runHealthChecks(): Promise<HealthCheck[]> {
  try {
    const env = getSupabaseEnv();
    return [
      { name: "Zmienne środowiskowe", ok: true, detail: "Konfiguracja poprawna." },
      ...(await checkSupabaseConnection(env)),
    ];
  } catch (error) {
    return [
      {
        name: "Zmienne środowiskowe",
        ok: false,
        detail: error instanceof Error ? error.message : "Sprawdź SETUP-ME.md.",
      },
    ];
  }
}
