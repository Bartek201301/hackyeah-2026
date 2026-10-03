# Decyzje techniczne

Cztery osoby: trzy budują osobne funkcje, integrator utrzymuje wspólny fundament i scala.
Stack pozostaje: Next.js App Router, Supabase, Vercel. Nie zmieniamy architektury przed wyborem zadania.

1. **Własność zamiast równoczesnych edycji.** Każdy builder ma jeden feature; shared, app,
   migracje, zależności i konfiguracja należą do integratora. Wspólne zmiany też przechodzą PR.
2. **Jedne zasady dla wszystkich asystentów.** AGENTS.md to źródło prawdy, CLAUDE.md jest odnośnikiem.
3. **Kontrakt przed zależną pracą.** Typy i wyniki akcji ustalamy przed podziałem implementacji,
   nie o arbitralnej godzinie. Zmiany później pozostają kompatybilne.
4. **Małe PR i kontrolowana kolejność.** Jeden merge naraz, merge commit, aktualne origin/main,
   jedna akceptacja kolegi. Chronione main wymaga konfiguracji przez administratora GitHub.
5. **Kontrole jednakowe na każdym komputerze.** Node 24.14.1, npm 11.11.0, npm ci,
   format:check, typy, lint, reguły zależności, testy narzędzi i build w CI bez bazy/kluczy.
   Vercel używa 24.x i sam aktualizuje wersje minor/patch.
6. **Nie przeceniamy zielonego buildu.** Kontrole statyczne nie potwierdzają działania polityk bazy,
   zapisu danych ani całego demo. Potrzebne są doctor, preview i próba na production.
7. **Jedna baza to świadomy kompromis.** Mniej konfiguracji, ale wszystkie gałęzie widzą te same dane.
   Integrator wykonuje tylko zapisane migracje i kontroluje resety. Gałąź nie jest izolacją bazy.
8. **Dostęp ustalamy z zadaniem.** Szablon SQL włącza RLS, ale nie daje otwartego zapisu. Nie dodajemy
   logowania na zapas; wybieramy jawne polityki, kiedy znamy użytkowników i wymagania.
9. **Spójne UI.** Wspólne komponenty i tokeny, lucide-react, polskie komunikaty, obsługa stanów ekranu.
10. **Formatowanie bez konfliktów.** Formatujemy własne zmienione pliki. Hook Claude jest dodatkiem,
    a wspólny format:check w CI weryfikuje efekt niezależnie od edytora.

Nie dodajemy Docker, monorepo, nowego frameworka testowego ani automatycznych zmian schematu
na każdej gałęzi. Testy narzędzi używają wbudowanego node:test. Logowanie, realne encje,
integracje i końcowy podział funkcji zależą od wybranego zadania.
