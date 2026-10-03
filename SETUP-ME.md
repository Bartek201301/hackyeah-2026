# Konfiguracja zespołu i usług

Repo: https://github.com/Bartek201301/hackyeah-2026. Projekt publiczny; środowisko lokalne poza Git.
Zasady: AGENTS.md. Zadanie i przypisania: SPEC.md. Nie zakładamy, że usługi już działają.

## 1. Każdy z czterech komputerów

1. Zaakceptuj zaproszenie do repo i sklonuj je. Pracuj we własnym checkoutcie.
2. Zainstaluj Node **24.14.1** (`nvm install && nvm use`, jeśli używasz nvm; fnm obsługuje .nvmrc).
3. Ustaw npm: `npm install -g npm@11.11.0`; sprawdź `node -v` i `npm -v`.
4. `npm ci` i `npm run check`. To działa bez kluczy i bez połączenia z bazą.
5. `cp .env.example .env.local`. Integrator przekazuje Project URL i **publishable key**
   (`sb_publishable_...`). Secret/service_role i legacy JWT nie są akceptowane przez ten projekt.
6. `npm run doctor`, następnie `npm run dev`. Otwórz http://localhost:3000/health i `/ui`.
7. Potwierdź instalację, check, działanie strony i **HEALTH: OK**. Sam start serwera nie wystarczy.

| Osoba / rola (przypisanie po wyborze) | npm ci + check | dev + /ui | doctor + /health |
| ------------------------------------- | -------------- | --------- | ---------------- |
| Integrator                            | Oczekuje       | Oczekuje  | Oczekuje         |
| Builder A                             | Oczekuje       | Oczekuje  | Oczekuje         |
| Builder B                             | Oczekuje       | Oczekuje  | Oczekuje         |
| Builder C                             | Oczekuje       | Oczekuje  | Oczekuje         |

Wyniki zbiera integrator; nikt nie potwierdza za inną osobę. Asystent może być Codex lub Claude;
oba czytają AGENTS.md i SPEC.md. Hook Claude to wygoda, format:check to wspólna kontrola.

## 2. GitHub — właściciel repo i integrator

- Właściciel dodaje trzy pozostałe osoby jako collaborators z prawem Write.
- Zmiana tego setupu wchodzi przez PR. Po pierwszym zielonym uruchomieniu **team-check**
  administrator ustawia ochronę main. Prawo Write nie wystarcza do ustawiania ochrony.
- Konfiguracja: PR obowiązkowy, 1 aprobata kolegi, odrzucanie starych aprobat po zmianach,
  wymagany **team-check**, aktualna gałąź względem main, rozwiązane dyskusje,
  ochrona obejmuje adminów, force push i usuwanie main wyłączone.
- Nie wymagamy aprobaty CODEOWNERS (właściciel nie może zatwierdzić własnego PR).
  Po przypisaniu loginów integrator dodaje CODEOWNERS: domyślnie integrator dla repo,
  konkretni builderzy dla ich katalogów. Wszyscy muszą mieć Write.
- Używamy **merge commit**. Nie włączaj wymogu linear history, który wyklucza merge commits.
- Gotowy payload administrator może zastosować po pierwszym zielonym CI:

```sh
gh api --method PUT repos/Bartek201301/hackyeah-2026/branches/main/protection \
  --input .github/main-protection.json
```

Panel: https://github.com/Bartek201301/hackyeah-2026/settings/branches.
Przed zastosowaniem porównaj istniejącą ochronę, aby nie osłabić nowszych reguł. Po wykonaniu
odczytaj ustawienia ponownie i sprawdź, że czerwony PR nie może zostać scalony.
Nie obchodź braku recenzenta pushem admina. Integrator scala po jednym PR; kolejny aktualizuje main.

## 3. Jeden projekt Supabase

Właściciel tworzy projekt w https://supabase.com/dashboard (jeśli jeszcze nie istnieje),
zapisuje hasło poza repo i daje integratorowi dostęp do wykonywania SQL.
Project URL oraz publishable key są w panelu Connect / ustawieniach API projektu.
Local, wszystkie preview i production wskazują **ten sam projekt** i modyfikują te same dane.

Integrator sprawdza i wykonuje istniejącą migrację health_check, a potem uruchamia doctor.
Każda kolejna migracja: uzgodnienie kontraktu → commit i przegląd PR → wykonanie zapisanej migracji
w SQL Editor → sprawdzenie wyniku → wpis do supabase/APPLIED.md → scalenie zależnego kodu.
Nie stosujemy automatycznych migracji z gałęzi. Zastosowane pliki są niezmienne; poprawki to nowe migracje.
Szablon SQL ma RLS i brak dostępu domyślnego. Polityki oraz granty muszą odpowiadać uzgodnionemu SPEC.

Dane demo: stałe ID i UPSERT bez duplikatów. Resety wyłącznie po uzgodnieniu z całym zespołem.
Przed próbą i prezentacją zatrzymaj zapisy testowe. Cofnięcie wdrożenia nie cofa migracji.

## 4. Vercel i sprawdzenie publikacji

1. Właściciel importuje repo w https://vercel.com/new jako Next.js; potwierdza production branch **main**.
2. Node w projekcie: **24.x** (Vercel zarządza wersjami minor/patch). Instalacja: npm ci.
3. Ustaw obie zmienne z .env.example w Production i Preview, dla jednego projektu Supabase.
4. Po zmianie NEXT_PUBLIC_* wykonaj nowe wdrożenie — wartości są wbudowane przy buildzie.
5. Sprawdź dostęp każdego z czterech autorów do preview i możliwość uruchomienia deploymentu ich PR.
   Jeśli plan Vercel lub ochrona preview ogranicza dostęp, właściciel ustawia dostęp zgodnie
   z dostępnym planem. Nie zakładamy, że wyłączenie ochrony rozwiązuje prawa autorów do wdrożeń.
6. Na production i preview sprawdź `/health` oraz `/ui`. Zapisz adresy i wynik w PR.

Status konfiguracji i adresy: **do potwierdzenia przez właściciela/integratora**.
CI nie korzysta z bazy; zielone CI nie jest potwierdzeniem zdrowia wdrożenia.

## 5. Po wyborze wyzwania AI Control Layer

1. Potwierdź oficjalny URL i wagi jury; SPEC już zawiera zdolności wyzwania, ale nie przypisuje
   na siłę trzech funkcji builderom. Uzgodnij ludzi, pionowe wycinki i demo do 3 minut.
2. Uzgodnij minimalne wspólne typy interakcji, polityki, decyzji, audytu i budżetu oraz dostęp
   do danych przed zależnym kodem. Zachowaj niezmienniki z docs/ARCHITECTURE.md.
3. Integrator na krótkiej gałęzi przygotowuje potrzebne kontrakty, migracje, trasy i nawigację;
   `npm run new-feature <nazwa>` służy tylko uzgodnionym funkcjom.
4. Pełny check, koleżeńska recenzja, potrzebne kompatybilne migracje, merge fundamentu.
5. Builderzy tworzą gałęzie od aktualnego origin/main i pracują wyłącznie w przydzielonych katalogach.
6. Sprawdź dwie niezależne feature PR: po pierwszym merge drugi pobiera origin/main,
   scala go ze swoją gałęzią i ponawia CI. Potwierdź przepływ między funkcjami na preview.
7. Cały zespół ćwiczy demo na production, także legalne i wrogie interakcje, zmianę polityki,
   audyt i pomiar; odnotuj wynik, ograniczenia i okno bez zapisów.

## 6. Typowe blokady

- Czerwony check: popraw błąd; fałszywy alarm zgłoś integratorowi, nie usuwaj kontroli.
- Konflikt: właściciele uzgadniają wynik, nie wybieramy automatycznie całego ours/theirs.
- Doctor FAIL: pierwszy komunikat prowadzi do konfiguracji lub migracji; kluczy nie wklejamy do PR.
- Brak praw admina: właściciel ustawia ochronę; współpracownik nie może tego zrobić prawem Write.
- Regresja po merge: revert PR konkretnego merge SHA, a stan bazy osobno ocenia integrator.
