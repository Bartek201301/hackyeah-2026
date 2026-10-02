// `npm run doctor` — sprawdza, czy ten komputer jest gotowy do pracy:
// Node, zależności, .env.local, klucz Supabase i połączenie z bazą. Bez zależności.
import { existsSync, readFileSync } from "node:fs";

const results = [];
const ok = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => results.push({ ok: false, name, detail });

function report() {
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.some((r) => !r.ok);
  console.log(
    failed
      ? "\nDOCTOR: FAIL — napraw pierwszy ❌ od góry i uruchom ponownie."
      : "\nDOCTOR: OK — możesz pracować (npm run dev).",
  );
  process.exit(failed ? 1 : 0);
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 20 || (major === 20 && minor >= 9)) ok("Node.js", process.versions.node);
else {
  fail("Node.js", `masz ${process.versions.node}, potrzebny ≥ 20.9. Zainstaluj LTS z https://nodejs.org`);
  report();
}

if (existsSync("node_modules/next")) ok("Zależności", "node_modules zainstalowane");
else {
  fail("Zależności", "brak node_modules. Uruchom: npm ci");
  report();
}

if (!existsSync(".env.local")) {
  fail(".env.local", "brak pliku. Uruchom: cp .env.example .env.local i wklej wartości (SETUP-ME.md)");
  report();
}
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL",
    url
      ? `nieprawidłowy format: "${url}". Oczekiwano https://<id>.supabase.co`
      : "puste. Wklej Project URL (SETUP-ME.md)",
  );
  report();
}
ok("NEXT_PUBLIC_SUPABASE_URL", url);

if (key.startsWith("sb_secret_")) {
  fail(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "to jest klucz SECRET — nie może trafić do przeglądarki! Wklej klucz publishable (sb_publishable_...)",
  );
  report();
}
if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
  fail(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    key
      ? "nie wygląda na klucz Supabase (oczekiwano sb_publishable_...)"
      : "puste. Wklej publishable key (SETUP-ME.md)",
  );
  report();
}
ok("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", `${key.slice(0, 18)}…`);

const base = url.replace(/\/$/, "");
try {
  const res = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } });
  if (!res.ok) {
    fail("Projekt Supabase i klucz", `Supabase odrzucił klucz (HTTP ${res.status}). Skopiuj klucz ponownie.`);
    report();
  }
  ok("Projekt Supabase i klucz", "klucz zaakceptowany");
} catch (e) {
  fail(
    "Projekt Supabase i klucz",
    `brak połączenia z ${base} (${e.cause?.code ?? e.message}). Sprawdź URL i internet.`,
  );
  report();
}

const rpc = await fetch(`${base}/rest/v1/rpc/health_check`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: "{}",
});
const body = await rpc.text();
if (rpc.ok) ok("Baza danych", `odpowiedź: ${body}`);
else
  fail(
    "Baza danych",
    `HTTP ${rpc.status}: ${body.slice(0, 200)}. Wykonaj w Supabase SQL Editor plik supabase/migrations/20261002000000_health_check.sql`,
  );

report();
