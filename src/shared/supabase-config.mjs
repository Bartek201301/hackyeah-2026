// Shared validation for the app and doctor. Never prints the key value.
/** @param {string | undefined} rawUrl @param {string | undefined} rawKey */
export function validateSupabaseConfig(rawUrl, rawKey) {
  const url = rawUrl?.trim().replace(/\/$/, "") ?? "";
  const key = rawKey?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL: set https://<id>.supabase.co in .env.local (docs/team/setup.md).",
    );
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_... required; secret and legacy JWT keys are not allowed. Check docs/team/setup.md.",
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
    ["Supabase project and key", "/auth/v1/settings", "GET"],
    ["Database", "/rest/v1/rpc/health_check", "POST"],
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
          detail: `HTTP ${response.status}. ${method === "POST" ? "Check the health_check migration with the integrator." : "Check the project URL and publishable key."}`,
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
        detail: method === "POST" ? "health_check responds correctly." : "Key accepted.",
      });
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      checks.push({
        name,
        ok: false,
        detail: timeout
          ? "Timed out. Check your internet connection and try again."
          : "No connection or invalid response. Check the configuration and migration with the integrator.",
      });
      break;
    }
  }
  return checks;
}
