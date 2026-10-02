@AGENTS.md

# Zasady projektu (obowiązują w każdej sesji)

Zespół NIE czyta kodu. Każdą zmianę weryfikujesz URUCHOMIENIEM, nie czytaniem. Nie mów „działa”, dopóki nie uruchomiłeś `npm run check` (i strony w `npm run dev`, jeśli zmieniasz UI).

## Kto co edytuje

- Pracujesz WYŁĄCZNIE w `src/features/<twoj-feature>/`. Nazwę featura i gałąź podaje człowiek na starcie sesji — jeśli jej nie znasz, zapytaj.
- NIE edytujesz (właściciel: integrator, tylko na `main`): `src/shared/**`, `src/app/**`, `package.json`, `package-lock.json`, `supabase/**`, `CLAUDE.md`. Potrzebujesz zmiany? Zatrzymaj się i napisz człowiekowi dokładnie, co ma zgłosić integratorowi.
- NIE instaluj pakietów npm. Nigdy.
- Feature NIGDY nie importuje z innego featura. Kod potrzebny w dwóch featurach należy do `src/shared/` (zgłoszenie do integratora).
- `src/app/<nazwa>/page.tsx` ma jedną linię: `export { default } from "@/features/<nazwa>";`. Nowe strony tworzy integrator: `npm run new-feature <nazwa>`.

## Kontrakt typów: `src/shared/types.ts`

- Kształt danych wspólnych. Po zamrożeniu (2. godzina) TYLKO DOPISYWANIE: nowe typy i nowe pola opcjonalne. Nigdy zmiana nazwy, typu ani usunięcie. Tylko integrator.
- Typy prywatne featura: `src/features/<nazwa>/types.ts`.

## Wzorzec featura (kopiuj z `src/features/example/`)

- `index.ts` — jedyne publiczne wejście (eksport strony jako default + `meta`).
- `queries.ts` — ODCZYTY, serwer: `createSupabaseServer()` z `@/shared/supabase/server`.
- `actions.ts` — ZAPISY, `"use server"`, zawsze zwraca `ActionResult<T>` z `@/shared/types`, nigdy nie rzuca do UI.
- `components/` — strona = komponent serwerowy; interaktywne części osobno z `"use client"`.
- `@/shared/supabase/client` tylko do realtime i uploadu plików.

## Wygląd (design = 20% oceny)

- Ekrany budujesz WYŁĄCZNIE z `@/shared/ui` (katalog: strona `/ui`) i klas tokenowych: `bg-brand`, `text-muted`, `border-border`, `bg-surface`, `rounded-card`, `text-danger`…
- Zakazane w featurach: surowe kolory (`#fff`, `bg-[...]`), pliki `.css`, inne biblioteki UI.
- Każda strona: `PageHeader` na górze; lista bez danych → `EmptyState`; błąd akcji → `Notice tone="danger"`; wysyłanie → `Button loading`.
- Ikony: tylko `lucide-react`. Teksty w UI po polsku.

## Komendy

- `npm run check` — typy + lint + zasady struktury + build. Uruchom przed KAŻDYM commitem. Czerwone = nie pushuj.
- `npm run doctor` — czy .env.local i baza działają. Strona `/health` — to samo w przeglądarce/na Vercelu.
- `npm run dev` — aplikacja na http://localhost:3000

## Git

- Gałąź `feat/<nazwa>`. Commituj często, małymi krokami. Przed pushem: `npm run check`.
- Aktualizacja z main: `git merge main` (nie rebase).
- Integrator scala po jednej gałęzi i po każdej uruchamia `npm run check`. Czerwone po scaleniu → cofnąć scalenie (`git revert -m 1 HEAD`), nie naprawiać w nocy na `main`.

## Nasze narzędzia kontrolne

- Jeśli nasz własny skrypt kontrolny (`check:rules`, `doctor`, hook formatowania) zgłosi fałszywy alarm: usuń go z `npm run check` (albo z `.claude/settings.json`) i pracuj dalej. NIE debugujemy własnych narzędzi w trakcie hackathonu.
- Ostrzeżenia (⚠️) nie blokują — przekaż je człowiekowi jednym zdaniem.
