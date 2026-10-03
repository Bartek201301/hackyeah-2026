import "server-only";
import { getSupabaseEnv } from "./env";
import { checkSupabaseConnection } from "./supabase-config.mjs";

export type HealthCheck = { name: string; ok: boolean; detail: string };

export async function runHealthChecks(): Promise<HealthCheck[]> {
  try {
    const env = getSupabaseEnv();
    return [
      { name: "Environment variables", ok: true, detail: "Configuration is valid." },
      ...(await checkSupabaseConnection(env)),
    ];
  } catch (error) {
    return [
      {
        name: "Environment variables",
        ok: false,
        detail: error instanceof Error ? error.message : "Check docs/team/setup.md.",
      },
    ];
  }
}
