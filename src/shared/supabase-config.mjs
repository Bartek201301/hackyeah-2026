// Wspólna walidacja dla aplikacji i doctor. Nigdy nie wypisuje wartości klucza.
/** @param {string | undefined} rawUrl @param {string | undefined} rawKey */
export function validateSupabaseConfig(rawUrl, rawKey) {
  const url = rawUrl?.trim().replace(/\/$/, "") ?? "";
  const key = rawKey?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL: wpisz https://<id>.supabase.co w .env.local (SETUP-ME.md).");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: wymagany sb_publishable_...; klucze secret i legacy JWT są niedozwolone. Sprawdź SETUP-ME.md.",
    );
  }
  return { url, key };
}

/**
 * @param {{url: string, key: string}} config
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} options
 * @returns {Promise<Array<{name: string, ok: boolean, detail: string}>>}
 */
export async function checkSupabaseConnection(config, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const checks = [];
  for (const [name, path, method] of [
    ["Projekt Supabase i klucz", "/auth/v1/settings", "GET"],
    ["Baza danych", "/rest/v1/rpc/health_check", "POST"],
  ]) {
    try {
      const response = await fetchImpl(`${config.url}${path}`, {
        method,
        headers: { apikey: config.key, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        checks.push({
          name,
          ok: false,
          detail: `HTTP ${response.status}. ${method === "POST" ? "Sprawdź migrację health_check z integratorem." : "Sprawdź adres projektu i publishable key."}`,
        });
        break;
      }
      if (method === "POST") {
        const body = await response.json();
        if (typeof body !== "string" || !body.startsWith("ok ")) throw new Error("invalid-response");
      }
      checks.push({
        name,
        ok: true,
        detail: method === "POST" ? "health_check odpowiada poprawnie." : "Klucz zaakceptowany.",
      });
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      checks.push({
        name,
        ok: false,
        detail: timeout
          ? "Przekroczono czas oczekiwania. Sprawdź internet i spróbuj ponownie."
          : "Brak połączenia lub nieprawidłowa odpowiedź. Sprawdź konfigurację i migrację z integratorem.",
      });
      break;
    }
  }
  return checks;
}
