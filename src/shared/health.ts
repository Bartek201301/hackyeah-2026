import "server-only";

import { getSupabaseEnv } from "@/shared/env";
import { createSupabaseServer } from "@/shared/supabase/server";

export type HealthCheck = { name: string; ok: boolean; detail: string };

/*
 * Sprawdza łańcuch: zmienne środowiskowe -> projekt Supabase + klucz -> baza danych.
 * Używane przez stronę /health. Ta sama logika jest w scripts/doctor.mjs (terminal).
 */
export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  let env: { url: string; key: string };
  try {
    env = getSupabaseEnv();
    checks.push({ name: "Zmienne środowiskowe", ok: true, detail: env.url });
  } catch (e) {
    checks.push({ name: "Zmienne środowiskowe", ok: false, detail: (e as Error).message });
    return checks;
  }

  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.key },
      cache: "no-store",
    });
    if (res.ok) {
      checks.push({ name: "Projekt Supabase i klucz", ok: true, detail: "Klucz zaakceptowany." });
    } else {
      checks.push({
        name: "Projekt Supabase i klucz",
        ok: false,
        detail: `Supabase odrzucił klucz (HTTP ${res.status}). Skopiuj ponownie publishable key (SETUP-ME.md).`,
      });
      return checks;
    }
  } catch (e) {
    checks.push({
      name: "Projekt Supabase i klucz",
      ok: false,
      detail: `Brak połączenia z ${env.url}: ${(e as Error).message}. Sprawdź URL i internet.`,
    });
    return checks;
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("health_check");
  if (error) {
    checks.push({
      name: "Baza danych",
      ok: false,
      detail: `${error.message} — wykonaj w Supabase SQL Editor plik supabase/migrations/20261002000000_health_check.sql (SETUP-ME.md).`,
    });
  } else {
    checks.push({ name: "Baza danych", ok: true, detail: `Odpowiedź bazy: ${String(data)}` });
  }
  return checks;
}
