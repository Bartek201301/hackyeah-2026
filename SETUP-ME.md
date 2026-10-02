# SETUP-ME — wszystko, co robi człowiek poza terminalem

🔴 = blokuje pracę zespołu, zrób dziś. 🟡 = może poczekać.
Repo: https://github.com/Bartek201301/hackyeah-2026 (publiczne — w repo nie ma żadnych kluczy, `.env.local` jest poza gitem).

---

## 0. 🔴 Onboarding zespołu (zrób na końcu, po krokach 1–6)

1. Wyślij każdej z 3 osób **prywatnie** (DM, nie publiczny kanał) wiadomość z bloku poniżej, wklejając dwie wartości z kroku 2.
2. Zbierz od **każdej** osoby potwierdzenie (zrzut ekranu albo wklejony tekst), że u niej:
   - `npm ci` zakończyło się bez `ERR!`,
   - `npm run doctor` kończy się linią `DOCTOR: OK`,
   - `npm run dev` działa i http://localhost:3000/health pokazuje `HEALTH: OK`.
3. Dopóki wszystkie 3 osoby nie potwierdzą — ten krok nie jest zrobiony.

```text
Repo: https://github.com/Bartek201301/hackyeah-2026
1) Zaakceptuj zaproszenie do repo (mail od GitHuba albo https://github.com/notifications).
2) W terminalu:
   git clone https://github.com/Bartek201301/hackyeah-2026.git
   cd hackyeah-2026
   node -v            # musi być 20.9 lub wyżej; jeśli nie: zainstaluj LTS z https://nodejs.org
   npm ci
   cp .env.example .env.local
3) Otwórz .env.local i wklej:
   NEXT_PUBLIC_SUPABASE_URL=<wkleję>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<wkleję>
4) npm run doctor      → ma się skończyć "DOCTOR: OK"
5) npm run dev         → otwórz http://localhost:3000/health → ma być "HEALTH: OK"
Odeślij mi zrzut ekranu z 4) i 5).
```

---

## 1. 🔴 Projekt Supabase

1. Wejdź na https://supabase.com/dashboard → zaloguj się (**Continue with GitHub**).
2. **New project** → Organization: Twoja → **Project name:** `hackyeah-2026` → **Database Password:** kliknij **Generate a password** i zapisz je w menedżerze haseł → **Region:** `Central EU (Frankfurt)` → **Create new project**.
3. Poczekaj ok. 2 minuty, aż status zmieni się z „Setting up” na aktywny.

## 2. 🔴 Klucze do `.env.local`

1. W projekcie: lewy pasek → **Project Settings** (ikona zębatki) → **API Keys**.
2. Jeśli w sekcji **Publishable key** nie ma klucza — kliknij **Create new API keys**.
3. Skopiuj **Publishable key** (zaczyna się od `sb_publishable_`). ⚠️ NIE kopiuj **Secret key** (`sb_secret_`) — `npm run doctor` i tak go odrzuci.
4. Skopiuj **Project URL**: przycisk **Connect** na górze projektu (albo Project Settings → **Data API**) → adres w formie `https://<id>.supabase.co`.
5. W folderze repo: `cp .env.example .env.local` i wklej obie wartości po znaku `=` (bez cudzysłowów, bez spacji).

## 3. 🔴 Funkcja diagnostyczna w bazie

1. Supabase → lewy pasek → **SQL Editor** → **New query**.
2. Wklej całą zawartość pliku `supabase/migrations/20261002000000_health_check.sql` → **Run**.
3. Wynik: „Success. No rows returned”.
4. W terminalu: `npm run doctor` → ostatnia linia `DOCTOR: OK`.

## 4. 🔴 Vercel — podpięcie repo

1. https://vercel.com/signup → **Continue with GitHub** (plan **Hobby** wystarczy).
2. **Add New…** → **Project** → na liście repozytoriów znajdź `hackyeah-2026` → **Import**.
   Nie ma go na liście? Kliknij **Adjust GitHub App Permissions** → zaznacz `hackyeah-2026` → Save → wróć.
3. Framework Preset: **Next.js** (wykryje sam). Niczego innego nie zmieniaj.
4. Rozwiń **Environment Variables** i dodaj dwie zmienne (Key / Value) — te same co w `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL` oraz `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. **Deploy**. Po ok. minucie: **Continue to Dashboard** → skopiuj adres z **Domains** (np. `hackyeah-2026.vercel.app`).
6. Sprawdź: Project → **Settings** → **Environment Variables** — przy obu zmiennych ma być zaznaczone **Production** i **Preview**. Jeśli nie — edytuj i zaznacz.
   ⚠️ Po każdej zmianie zmiennych na Vercelu: **Deployments** → `⋯` przy najnowszym → **Redeploy** (wartości `NEXT_PUBLIC_*` są wbudowywane podczas budowania).

## 5. 🔴 Wyłączenie ochrony podglądów

Na planie Hobby koledzy nie mogą być członkami projektu na Vercelu, więc domyślna ochrona pokazałaby im ekran logowania zamiast podglądu ich gałęzi.
Project → **Settings** → **Deployment Protection** → **Vercel Authentication** → przełącz na **Disabled** → **Save**.

## 6. 🔴 Potwierdzenie łańcucha publikacji

Otwórz `https://<twoja-domena>.vercel.app/health` → ma być **HEALTH: OK** z trzema zielonymi punktami.
(Claude sprawdzi też podgląd osobnej gałęzi — podaj mu adres produkcyjny.)

## 7. 🔴 Zaproszenia do repo

GitHub → repo `hackyeah-2026` → **Settings** → **Collaborators** → **Add people** → wpisz login GitHub każdej z 3 osób → **Add to repository** (rola: Write). Każda osoba musi zaakceptować zaproszenie.

---

## 8. 🟡 Komputery zespołu (przed jutrem)

Każda osoba: Node.js ≥ 20.9 (`node -v`), `git`, zainstalowany i zalogowany Claude Code, konto GitHub.

## 9. 🟡 Dostęp integratora do Supabase (jeśli integrator to nie właściciel projektu)

Supabase → **Organization settings** → **Team** → **Invite** → e-mail integratora → rola **Developer** (lub Owner).

## 10. 🟡 Jutro, 2. godzina — kolejność pracy integratora

1. `SPEC.md` wypełniony → tabele: skopiuj `supabase/TEMPLATE-migracja.sql` do `supabase/migrations/<data>_<opis>.sql`, wykonaj w SQL Editor.
2. Uzupełnij `src/shared/types.ts` → od teraz tylko dopisywanie.
3. `npm run new-feature <nazwa>` × 3 → `npm run check` → commit + push na `main`.
4. Dopiero teraz każdy: `git pull` → `git checkout -b feat/<nazwa>`.
