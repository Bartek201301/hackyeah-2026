# SPEC — wyzwanie AI Control Layer

Status: **wyzwanie wybrane, zakres implementacji i przydział pracy otwarte**. Źródłem wymagań
jest oficjalny, czterostronicowy opis zadania HackYeah / Goldman Sachs „AI Control Layer”
przekazany zespołowi 3 października 2026. [Strona z zadaniami HackYeah](https://hackyeah.pl/tasks-prizes).
Koncepcja rozwiązania i stan rezultatów są w [opisie pomysłu](docs/IDEA.md).
Postęp implementacji zapisujemy w PR; ten dokument utrzymuje integrator po uzgodnieniu z zespołem.

## 1. Cel i granica produktu

Budujemy lekką, elastyczną **warstwę kontroli** pośredniczącą między aplikacjami, agentami,
LLM, klientami/serwerami MCP, narzędziami, API oraz danymi. Może przyjąć postać gatewaya,
proxy, middleware, wrappera SDK lub równoważnego pośrednika. Musi chronić także komunikację
agent–agent i żądane przez agentów działania. Przepływ i niezmienniki opisuje
[architektura](docs/ARCHITECTURE.md).

Aplikacja bankowości inwestycyjnej, inbox, symulacja Excela/PowerPointa lub inny workflow
mogą służyć jako **demo referencyjne**. Nie są zależnością rdzenia ani celem samym w sobie.
Obecne nazwy robocze nie określają nazwy końcowej ani domeny produktu.

## 2. Obowiązkowe zdolności i dowód

| Zdolność                                  | Minimalny dowód do przygotowania                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Centralna, konfigurowalna polityka        | Zmiana progu, kontroli, uprawnienia, modelu lub narzędzia zmienia wynik przewidywalnie; reload bez przebudowy tam, gdzie praktyczny.                                                       |
| Obrona hybrydowa                          | Deterministyczne sprawdzenia tożsamości, uprawnień, limitów i sygnatur wraz z semantyczną oceną intencji/ryzyka; decyzja egzekwowana przez kod i politykę.                                 |
| Firewall działań                          | Kontrola żądań narzędzi, MCP, HTTP, bazy, pamięci, plików, kodu, modelu, transferu danych i kosztownych/destrukcyjnych operacji, stosownie do wybranych integracji.                        |
| Budżety i zasoby                          | Limity kosztu API, tokenów, żądań, czasu, pętli agenta i zużycia zasobów, także dla modeli lokalnych; przewidywalne blokowanie, ograniczanie lub routing.                                  |
| Zewnętrzne dane o zagrożeniach            | Konfigurowalne sygnatury i wskaźniki zagrożeń; zmiana feedu wpływa na wynik bez wpisywania ataków w kod demo.                                                                              |
| Raportowanie i audyt                      | Dane audytowe do widoku zarządczego i technicznego; eksport, jeśli praktyczny. Dashboard jest prezentacją danych, nie jedynym zapisem.                                                     |
| Telemetria                                | Rzeczywiste pomiary opóźnienia całości i narzutu warstwy, etapów kontroli, P50/P95/P99, przepustowości, udziału blokad/redakcji, tokenów/kosztu i zasobów modelu lokalnego, gdy mierzalne. |
| Automatyczny zestaw testów bezpieczeństwa | Jedna oczywista komenda uruchamia przypadki pozytywne, negatywne i zmiany konfiguracji bez płatnych API. Dokładną komendę ustalimy przy implementacji w istniejącej konwencji npm.         |

## 3. Kryteria oceny i oczekiwane rezultaty

| Kryterium z oficjalnego opisu               | Waga | Potrzebny dowód                                                               |
| ------------------------------------------- | ---: | ----------------------------------------------------------------------------- |
| Solidność rozwiązania i jakość zabezpieczeń |  30% | Działające kontrole dla prawidłowych i wrogich interakcji.                    |
| Architektura i wydajność                    |  20% | Prosty diagram, integracja z agentem oraz rzeczywiste pomiary narzutu.        |
| Raportowanie bezpieczeństwa                 |  20% | Interaktywny dashboard, metryki i eksportowalne logi audytowe.                |
| Kompletność zestawu testów                  |  15% | Uruchamialne testy pozytywne i negatywne, w tym budżety i exploity.           |
| Praktyczność wdrożenia i skalowalność       |  15% | Prosty punkt integracji, konfigurowalne polityki i uzasadniona droga rozwoju. |

Oficjalne oczekiwane rezultaty: **(1)** funkcjonalna warstwa kontroli łatwa do wpięcia między
aplikację, agenta, MCP i model oraz prosty diagram architektury; **(2)** udokumentowany
przykładowy plik polityki z poziomami rygoru i zasadami budżetu; **(3)** prosty interaktywny
dashboard pokazujący kontrole, stan bezpieczeństwa, blokowane zagrożenia i koszt/zużycie;
**(4)** gotowy do uruchomienia zestaw testów kontroli, limitów i znanych exploitów.
Agent użyty do pokazu może być własny lub istniejący. Organizator nie zapewnia płatnych API,
datasetów ani specjalnego sprzętu; całość musi dać się zbudować i uruchomić we własnym środowisku.
Przy wykorzystaniu kodu open source sprawdzamy licencje.

Nie deklarujemy wyników benchmarku bez pomiaru ani gotowości systemu na podstawie buildu.

## 4. Scenariusze testowe

Pozytywne: poprawna interakcja, autoryzowane narzędzie, zwykłe wywołanie modelu i dozwolony
zasób. Negatywne: PII i sekrety, prompt injection bezpośredni i pośredni, niedozwolone narzędzie
lub model, eksfiltracja i transfer poufnych danych, nadmierna samodzielność agenta,
wyczerpanie budżetu, zapętlona egzekucja, wzorce złośliwego kodu i niebezpiecznej
deserializacji oraz historyczne sygnatury. Testy obejmą zmianę progów, feedów, budżetów,
włączenie/wyłączenie kontroli i przeładowanie konfiguracji. Gdzie możliwe, wyniki są deterministyczne.

Zakładamy, że sędziowie wyślą dowolne wejścia i działania, zmienią konfigurację i sprawdzą logi
oraz wydajność. Nie wiążemy zabezpieczeń ze skryptem pokazu.
Dobór kontroli powinien uwzględniać publiczne źródła zagrożeń, np. OWASP,
oraz aktualizowalne sygnatury zamiast zamkniętej listy przygotowanej pod demo.

## 5. Zespół i granice pracy

| Rola       | Osoba / GitHub | Obecna odpowiedzialność                                                                  |
| ---------- | -------------- | ---------------------------------------------------------------------------------------- |
| Integrator | Do przypisania | `src/shared/**`, `src/app/**`, baza, konfiguracja, zależności, CI, scalenia i publikacja |
| Builder A  | Do przypisania | Jeden uzgodniony `src/features/<nazwa>/**`                                               |
| Builder B  | Do przypisania | Jeden uzgodniony `src/features/<nazwa>/**`                                               |
| Builder C  | Do przypisania | Jeden uzgodniony `src/features/<nazwa>/**`                                               |

Możliwy podział tematyczny: platforma/polityka, detektory i semantyka, audyt/raporty,
red team/integracje. To **kierunek podziału**, nie przypisanie katalogów ani osób.
Integrator tworzy wspólne kontrakty i trasy przed pracą zależną. Loginy umożliwią CODEOWNERS.

## 6. Kontrakty przed równoległą implementacją

Status: **nieuzgodnione**. `src/shared/types.ts` zawiera obecnie tylko `Id`, `IsoDateTime`
i `ActionResult<T>`; nie zawiera kontraktów warstwy kontroli. Uzgodnimy ich minimalny kształt
przed zależną implementacją, bez zmiany nazw tylko dla zgodności z przykładami w architekturze.

| Granica                         | Co trzeba uzgodnić                                                   | Właściciel              |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| Interakcja i kontekst działania | Aktor, tożsamość/rola, cel, zasób, dane, trace ID                    | Integrator z odbiorcami |
| Wynik kontroli i decyzja        | Fakty deterministyczne, ocena semantyczna, polityka, werdykt i powód | Integrator z odbiorcami |
| Audyt i budżet                  | Zdarzenie, metryki, licznik/limit, wpływ decyzji                     | Integrator z odbiorcami |
| Feed zagrożeń                   | Źródło, wersja, wskaźnik i sposób aktualizacji                       | Integrator z odbiorcami |

Pola trwałych encji odpowiadają kolumnom. Zmiany po uzgodnieniu pozostają kompatybilne
lub wymagają koordynacji wszystkich odbiorców; nikt nie zmienia wspólnego kontraktu jednostronnie.
Local, preview i production dzielą jeden projekt Supabase. Dostęp, RLS i tożsamość ustalamy
świadomie; publishable key nie jest kontrolą dostępu.

## 7. Demo i warunek ukończenia

Demo do 3 minut powinno pokazać legalną interakcję, próbę naruszenia, zmianę konfiguracji
wpływającą na werdykt oraz ślad audytowy i pomiar. Domena referencyjna pozostaje otwarta.
Dane testowe przygotowuje integrator w powtarzalnym seedzie; reset wymaga uzgodnienia z zespołem.

Ukończenie wymaga zielonego `npm run check` i CI, koleżeńskiej recenzji, testów kontroli,
sprawdzonej ścieżki na preview i próby demo na production. Wymagane migracje wykonuje
integrator i zapisuje w `supabase/APPLIED.md`. Build nie potwierdza działania bazy, polityk,
konfiguracji na żywo ani pokazu.
Każdy ekran produktu zachowuje czytelny stan pusty, ładowania/wysyłania i błędu.

## OPEN QUESTIONS

- Nazwa końcowa i domena demo referencyjnego.
- Kształt konfiguracji oraz sposób przeładowania w wybranej topologii.
- Dostawca modelu semantycznego (lokalny lub zdalny), tryb synchroniczny/asynchroniczny i routing.
- Znaczenie `ESCALATE` i odbiorca eskalacji.
- Trwałość audytu i liczników budżetu; topologia wdrożenia i uwierzytelnianie.
- Przydział ludzi, katalogów i kolejność pionowych wycinków po zatwierdzeniu kontraktów.
