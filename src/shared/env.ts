/*
 * Zmienne środowiskowe. Czytane leniwie (dopiero przy użyciu), więc aplikacja
 * buduje się i startuje bez kluczy, a brak klucza daje czytelny komunikat
 * dokładnie tam, gdzie klucz jest potrzebny.
 *
 * Uwaga: process.env.NEXT_PUBLIC_* musi być zapisane dosłownie (nie przez zmienną),
 * bo Next wstawia te wartości do kodu przeglądarki w czasie budowania.
 */

const HELP =
  "Uzupełnij plik .env.local (wzór: .env.example, instrukcja: SETUP-ME.md), a potem zrestartuj `npm run dev`.";

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Brak zmiennej ${name}. ${HELP}`);
  }
  return value.trim();
}

export function getSupabaseEnv() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!/^https:\/\/.+/.test(url)) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL musi zaczynać się od https:// (jest: "${url}"). ${HELP}`);
  }
  return { url, key };
}
