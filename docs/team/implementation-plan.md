# AI Control Layer — podział pracy i plan 24 godzin

**Status: plan do przypisania osób, 3 października 2026.** [Specyfikacja techniczna](../product/technical-spec.md) jest źródłem kontraktów, [raport badawczy](../product/research-decisions.md) uzasadnia wybór technologii, a `AGENTS.md` określa własność katalogów i proces PR. Godziny liczymy od rozpoczęcia kodowania, nie od zakończenia badań. Celem jest działający, sprawdzony pionowy wycinek, nie pełna platforma.

## Mapa produktu

| Część                      | Co zobaczy lub sprawdzi użytkownik                             | Kod i właściciel                                                                        |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Wspólny rdzeń i integracja | Ten sam werdykt przez HTTP i MCP; brak skutku po odmowie       | Integrator: `src/shared/**`, `src/app/**`, `supabase/**`, zależności, konfiguracja i CI |
| Workbench                  | Edycja wejścia, odbiorcy, polityki i feedu; uruchomienie próby | Builder A: `src/features/workbench/**`                                                  |
| Detekcja                   | Ustalenia z wersjonowanych wskaźników; opcjonalny stan Laya    | Builder B: `src/features/detection/**`                                                  |
| Audyt                      | Historia, szczegóły trace, metryki i eksport                   | Builder C: `src/features/audit/**`                                                      |

**Osoby/GitHub:** integrator — do wpisania; Builder A — do wpisania; Builder B — do wpisania; Builder C — do wpisania. Integrator uzupełnia `docs/product/requirements.md` i CODEOWNERS po potwierdzeniu loginów. Nazwy katalogów powyżej są proponowanym stałym przydziałem; jedna osoba/agent edytuje swój zakres. Dodatkowa sesja używa osobnej gałęzi i worktree.

## Kolejność i punkty przekazania

| Czas    | Integrator                                                                           | Builderzy                                                                                          | Warunek przejścia                                                                         |
| ------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| H0–H2   | Potwierdza dostęp, język UI, kontrakt v1 i status migracji; tworzy gałąź fundamentu  | Wspólnie opiniują kontrakt i przygotowują syntetyczne przypadki                                    | Jedna uzgodniona specyfikacja pól, werdyktów i odpowiedzialności                          |
| H2–H5   | Dodaje wspólne typy, interfejsy, migrację/RLS, seed i cienkie trasy; PR fundamentu   | Bez zależnego kodu mogą przygotować makiety i przypadki testowe w swoim zakresie                   | `check:fast`, przegląd bezpieczeństwa/DB, migracja sprawdzona i wpisana, merge fundamentu |
| H5–H11  | Buduje evaluator, atomowy commit budżetu/audytu/outboxu i endpoint HTTP              | A: workbench; B: deterministyczne findingi; C: odczyt audytu i widoki                              | Działająca legalna i blokowana ścieżka z testem skutku                                    |
| H11–H16 | Integruje trzy PR kolejno, dodaje eksport i pomiary; jeśli czas pozwala, adapter MCP | Builderzy usuwają błędy swoich feature'ów i dostarczają testy                                      | `npm run check`, doctor, RLS i przegląd HTTP na preview                                   |
| H16–H20 | Testuje MCP Inspector, publiczny dostęp i wdrożenie; organizuje próbę demo           | B może sprawdzić lokalny Sentinel poza ścieżką publiczną; A/C dopracowują czytelność i stany błędu | Pełna ścieżka sędziego na preview; żadne dane rzeczywiste                                 |
| H20–H24 | Zamraża funkcje, wykonuje regresję, ćwiczy pokaz na production i zbiera dowody       | Każdy sprawdza swój obszar i uczestniczy w próbie                                                  | Zielone CI, aprobata kolegi, potwierdzony skutek/audyt/metryki na production              |

To budżet, nie obietnica, że wszystkie etapy zmieszczą się dokładnie w tych godzinach. Integrator scala po jednym PR, a kolejny branch scala aktualne `origin/main` i uruchamia kontrole ponownie. Wspólne zmiany zgłoszone przez buildera trafiają do PR integratora, bez kopiowania kodu shared do feature'a.

## Konkretne zadania i definicja przekazania

**Integrator** zamraża minimalne typy i przykładową politykę, tworzy katalogi przez `npm run new-feature`, przygotowuje RLS, serwerowy zapis i wersjonowanie, składa funkcje w trasach oraz pilnuje, by żaden ekran ani MCP nie wywołały efektu poza silnikiem. Odpowiada za zmiany setupu secret key, ochronę dostępu do publicznego podglądu, testy współbieżności/awarii, migrację, CI i wdrożenie. Przekazuje builderom stabilne typy, syntetyczny seed, działający kontrakt HTTP oraz przykładowe odpowiedzi.

**Builder A — workbench** tworzy jedną stronę angielskiego demo z edycją dokumentu, propozycji wysyłki, odbiorcy, polityki/feedu i przyciskiem uruchomienia. Pokazuje kroki `document.read` i `message.send`, wynik, wersje i stan semantyki. Używa wspólnego UI, `PageHeader`, `EmptyState`, `Notice` i stanu loading. Nie zakłada, że kliknięcie wykonało skutek: odczytuje potwierdzony wynik i outbox. PR zawiera pozytywną i błędną ścieżkę UI.

**Builder B — detection** dostarcza czysty interfejs `inspect(input, policy, feed)` zwracający findings bez werdyktu; implementuje ograniczone literały, normalizację, testy polskie/angielskie, bezpieczne opisy i zakresy redakcji. Semantyka ma adapter `available/unavailable/timeout/abstain`; integracja Sentinel wchodzi tylko po lokalnym teście z mierzalnym czasem. PR nie dodaje własnych progów, uprawnień ani reguł wykonania. Gdy adapter nie jest gotowy, deterministyczny detektor nadal działa.

**Builder C — audit** tworzy listę zdarzeń per sesja, szczegóły trace, podział na fakty deterministyczne i sygnały semantyczne, licznik skutków/outboxu oraz P50/P95/P99 z liczbą próbek. Odczyty idą przez serwerowy klient użytkownika i RLS; eksport korzysta z autoryzowanej trasy integratora. PR ma stan pusty/błędu, paginację i test, że inny użytkownik nie widzi cudzej sesji.

## Priorytety i wyjścia awaryjne

**P0, bez negocjacji:** dwa zarządzane działania, jeden evaluator, edytowalna polityka/feed, budżet, audyt, rzeczywisty outbox, testy blokady bez efektu i bezpieczny błąd. Nie wolno uprościć P0 przez hardcoded wyjątek dla znanej próby.

**P1, gdy P0 działa:** czytelny angielski workbench i dashboard, eksport, rzeczywiste pomiary, jeden adapter MCP, publiczny preview. **P2:** lokalny Sentinel po próbie; fine-tuning po wydarzeniu.

Jeśli Supabase, secret key lub migracja nie są gotowe do H5, nie przedstawiamy nietrwałej pamięci jako publicznego audytu. Można pokazać ograniczony lokalny prototyp i nazwać brak trwałości, ale priorytetem jest odblokowanie bazy. Jeśli MCP nie przejdzie niezależnej próby do H16, publikujemy sprawdzony HTTP i jawnie odkładamy adapter. Jeśli Laya nie startuje albo ma nieakceptowalne opóźnienie, UI pokazuje `semantic unavailable`; testy deterministyczne trwają. Przy problemie builda/CI nie obchodzimy kontroli; zapisujemy blocker i rozwiązujemy go przed deklaracją gotowego demo.

## Decyzje potrzebne od ludzi

1. Imiona/loginy czterech osób oraz kto ma rolę integratora; wtedy wpisujemy je do wymagań i CODEOWNERS.
2. Dostęp integratora do projektu Supabase, secret key, Vercel i potwierdzenie statusu `health_check`; nie wklejać wartości do Git ani rozmowy.
3. Sposób udostępnienia publicznego preview sędziom i ochrona przed nadużyciem anonimowych sesji.
4. Oryginalny czterostronicowy brief partnera do porównania z transkrypcją wymagań.
5. Angielski UI sędziowski zgodny z potwierdzoną decyzją użytkownika i regułą `AGENTS.md`.

Na start kodowania wystarczy rozstrzygnąć punkty 1–3 i kontrakt z technicznej specyfikacji; punkt 4 jest pilnym sprawdzeniem zgodności. Postęp, adresy preview, wyniki `npm run check`, doctor i prób demo zapisujemy w PR, nie jako domniemane fakty w tej specyfikacji.
