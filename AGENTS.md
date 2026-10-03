<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Zasady zespołu — wspólne dla Codex, Claude i pracy ręcznej

Czytaj ten plik i SPEC.md przed pracą. Kod po angielsku, dokumentacja i UI po polsku.
Nie deklaruj „działa” bez uruchomionych kontroli. Build nie potwierdza działania bazy ani demo.

## Cztery role i własność

- Integrator: src/shared/**, src/app/**, supabase/**, zależności i lockfile, scripts/**,
  konfiguracja, dokumentacja, CI, scalenia i publikacja. Te zmiany też powstają na krótkich gałęziach i PR.
- Builder A / B / C: każdy ma jeden uzgodniony katalog src/features/<nazwa>/**, wraz z testami
  i prywatnymi typami. Nazwiska, loginy i katalogi przypisujemy w SPEC po wyborze zadania.
- Jeśli rola lub zakres nie są znane, ustal je przed edycją. Jawne zlecenie człowieka na zmianę
  konfiguracji lub wspólnego kodu upoważnia do wykonania tego zakresu jako integrator.
- Jedna osoba/agent edytuje dany zakres w danej chwili. Dodatkowe równoległe sesje potrzebują
  osobnej gałęzi i checkoutu/worktree; nie przełączaj gałęzi pod działającą sesją.
- Potrzebujesz wspólnej zmiany? Opisz w PR wymagany interfejs i zależność od PR integratora.
  Kontynuuj niezależną pracę; nie kopiuj wspólnego kodu do featura i nie zmieniaj cudzych plików.
- Tylko integrator zmienia zależności i narzędzia. Builder może uruchomić npm ci.
  Fałszywy alarm zgłoś z reprodukcją; nie wyłączaj kontroli samodzielnie.
- Nie refaktoruj poza zakresem. Nie usuwaj istniejących plików bez zgody człowieka.
  Po dwóch nieudanych próbach tego samego problemu zatrzymaj się i opisz blokadę oraz alternatywy.

## Architektura i kontrakty

- Wzorzec: src/features/example. index.ts to publiczne wejście (default strony i meta).
- App składa funkcje przez ich index.ts; trasy pozostają cienkie. Integrator tworzy je komendą
  npm run new-feature <nazwa>, scala fundament, a dopiero potem builderzy rozpoczynają pracę.
- Feature może zależeć od siebie i shared, nigdy od innego featura ani app.
  Shared nie importuje app ani features.
- queries.ts: odczyty serwerowe przez createSupabaseServer. actions.ts: „use server”,
  walidacja wejścia i ActionResult<T> dla oczekiwanych błędów. Nie pokazuj szczegółów bazy w UI.
- Interaktywne komponenty oznaczaj „use client”; klient Supabase przeglądarki tylko do uploadu/realtime.
- Wspólne typy i schemat uzgadniamy przed zależną implementacją. Nazwy pól odpowiadają kolumnom.
  Potem zmiany kompatybilne: nowe typy i opcjonalne pola. Zmianę łamiącą kontrakt najpierw uzgodnij
  z integratorem i wszystkimi odbiorcami; nie wdrażaj jej jednostronnie.
- Używaj shared/ui, tokenów kolorów i lucide-react. Strona: PageHeader, EmptyState, czytelny błąd
  (Notice) i stan wysyłania (Button loading). Prywatne pliki CSS są zabronione.

## Git i weryfikacja

1. Nowa gałąź: codex/<feature-lub-zadanie> od aktualnego origin/main. Zachowaj istniejące nazwy gałęzi.
2. Synchronizacja na własnej gałęzi: git fetch origin, potem git merge origin/main.
   Najpierw zapisz własne zmiany; nie nadpisuj cudzej pracy. Bez rebase współdzielonych gałęzi i force push.
3. Formatuj tylko pliki zmienione w swoim zakresie: npm run format -- <plik1> <plik2>.
4. Przed małym commitem: npm run check:fast. Po znaczącej zmianie i przed przekazaniem PR:
   npm run check (również build). UI sprawdź w przeglądarce. Doctor sprawdza bazę osobno, poza CI.
5. Commituj po każdej udanej, zweryfikowanej zmianie: type(scope): description. Bez Co-Authored-By.
6. PR do main: właściciel, zakres, zmiany wspólne, wynik kontroli i preview. Postęp aktualizuj w PR,
   nie w centralnej specyfikacji. Niedokończone zadanie oznacz jako draft.
7. Integrator scala po jednym PR, przez merge commit, po zielonym team-check i akceptacji kolegi.
   PR integratora akceptuje inny członek zespołu. Po każdym scaleniu następny PR aktualizuje main
   i ponawia kontrolę. Nikt nie pushuje bezpośrednio na main.
8. Regresja: nowa gałąź od origin/main, git revert -m 1 <SHA-scalenia>, kontrola i revert PR.
   Nie używaj ślepo HEAD. Cofnięcie kodu nie cofa bazy; integrator planuje kompatybilną naprawę migracją.

CODEOWNERS dodamy po przypisaniu loginów. Służy do kierowania recenzji; jedna akceptacja kolegi
jest obowiązkowa, ale akceptacja konkretnego właściciela nie blokuje jego własnego PR.

## Jedna wspólna baza i demo

Local, preview i production używają tego samego projektu Supabase — gałąź nie izoluje danych.
Tylko integrator wykonuje migracje i resetuje dane demo. Każda migracja jest najpierw commitowana,
sprawdzona w PR, następnie wykonana przed scaleniem zależnego kodu; wynik zapisuje w supabase/APPLIED.md.
Nie edytuj wykonanych migracji i nie rób zmian schematu poza plikami. Stosuj zmiany addytywne.
Używaj tylko danych testowych. Reset uzgadniaj z całym zespołem; przed pokazem wstrzymaj zapisy testowe.
Nowe tabele: RLS i jawne polityki dla operacji oraz ról; przy danych użytkownika warunki auth.uid().
Sposób logowania i dostępu ustalamy po wyborze zadania, bez domyślnych otwartych zapisów.
Klucze i .env.local nie trafiają do Git. Publikowalny klucz nie zastępuje polityk dostępu.

## Gotowe oznacza

Zielone npm run check i CI, akceptacja kolegi, spełnione kryteria SPEC oraz sprawdzona ścieżka
użytkownika na preview. Demo musi zostać sprawdzone także na production. Brak dostępu, zależności
lub sprawdzenia zgłoś wprost — nie zastępuj dowodu założeniem.
