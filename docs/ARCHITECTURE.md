# Architektura warstwy kontroli

Status: **kontrakt kierunkowy**, bez decyzji o konkretnym gatewayu, bazie, dostawcy modelu
czy formacie polityki. Obowiązkowe zdolności wyzwania są w [SPEC](../SPEC.md).
Obecne repozytorium jest szkieletem Next.js/Supabase; opisany przepływ nie jest jeszcze zaimplementowany.

## CORE PRODUCT i REFERENCE DEMO

Rdzeniem jest pośrednik zarządzający interakcjami aplikacji, agentów, LLM, MCP, narzędzi,
API i zasobów. Demo bankowe lub inne jest klientem tego pośrednika. Rdzeń nie importuje
logiki domeny demo i nie uzależnia polityk od znanych promptów czy scenariuszy sędziów.

## ARCHITECTURAL INVARIANTS

1. Każda zarządzana interakcja przechodzi przez warstwę kontroli; nie ma ścieżki demo omijającej egzekwowanie.
2. Jedno autorytatywne źródło polityki określa aktywne kontrole, progi, uprawnienia i limity.
3. **Modele AI mogą oceniać semantykę, ryzyko, intencję lub pewność. Deterministyczny kod i centralna polityka podejmują decyzje egzekwujące.**
4. Model nie przyznaje sobie uprawnień; prompt nie jest granicą bezpieczeństwa.
5. Kontrolujemy działania agenta i narzędzi oraz przepływ danych, nie tylko treść promptu.
6. Każdy istotny werdykt pozostawia możliwy do odtworzenia ślad audytowy.
7. Zmiana konfiguracji i feedu propaguje się przewidywalnie; wersja użyta dla decyzji jest identyfikowalna.
8. Automatyczne testy bezpieczeństwa są częścią produktu.
9. Logika rdzenia jest niezależna od aplikacji pokazowej.
10. Dostawca modelu semantycznego jest wymienialny.
11. Warstwa może działać i przejść testy bezpieczeństwa bez płatnych API, z lokalnym lub testowym dostawcą semantycznym.
12. Wygoda demo nie osłabia kontroli ani nie tworzy wyjątków w kodzie.

## Przepływ i werdykty

`INPUT → NORMALIZE → CONTEXT → DETERMINISTIC CONTROLS → SEMANTIC CONTROLS → POLICY ENGINE → VERDICT → EXECUTION / REJECTION → AUDIT`

Na wejściu normalizujemy interakcję i kontekst: **kto** działa, **co** chce zrobić,
**na jakim zasobie**, **z jakimi danymi**, według **jakiej polityki**, z **jakim ryzykiem**
i **pozostałym budżetem**. Działania obejmują m.in. MCP/tool calls, HTTP, bazę, pliki,
wykonanie kodu, wywołania modeli, transfer zewnętrzny i operacje destrukcyjne.

Słownik werdyktów: `ALLOW`, `WARN`, `REDACT`, `BLOCK`, `ESCALATE`, `ROUTE`.
Ograniczanie tempa i zakończenie zapętlonego działania są sposobami wykonania polityki
(np. `BLOCK` z powodem lub `ROUTE` do tańszego modelu), nie dodatkowymi werdyktami.
Polityka określa zachowanie przy błędzie detektora, dostawcy lub niedostępnej konfiguracji;
nie przyjmujemy milczącej zgody. Semantyczny wynik jest sygnałem probabilistycznym,
odrębnym od deterministycznego faktu o tożsamości, limicie czy allowliście.

## Centralna polityka i dane o zagrożeniach

W repozytorium **nie ma jeszcze pliku polityki ani silnika**. Planowana minimalna konfiguracja
powinna być czytelna dla sędziów i obejmować: aktywne kontrole, poziomy ważności,
progi, przypisanie werdyktów, budżety, modele, narzędzia, tożsamości/role,
dostawcę semantycznego oraz źródła sygnatur zagrożeń. Format (np. YAML/JSON) pozostaje otwarty.
Nie rozpraszamy tych reguł po feature'ach ani nie projektujemy rozbudowanego DSL na zapas.

Feedy to konfigurowalne, wersjonowane dane: sygnatury prompt injection, wzorce
złośliwego kodu, niebezpiecznej deserializacji, wskaźniki łańcucha dostaw modeli i inne
znane ataki. Zmiana progów, budżetów, kontroli i feedów musi mieć testy przeładowania
oraz przewidywalnego wyniku. Reload w runtime preferujemy, jeśli pozwala na to topologia.

Budżety obejmują koszt API, tokeny, żądania w okresie, czas/compute, pętle agentów
i zasoby modeli lokalnych lub komercyjnych. Ceny są danymi konfiguracyjnymi, nie stałą
architektury. Mechanizm musi móc ograniczyć, zablokować lub przekierować kosztowne żądanie.

## Kontrakty i dostawcy

Potrzebne są odpowiedniki `Interaction/RequestContext`, `SecurityFinding`,
`SemanticAssessment`, `PolicyDecision/ControlVerdict`, `AuditEvent`, `BudgetState`
i `ThreatIndicator`. To **przykłady nazw**, nie gotowe typy ani polecenie zmiany
`src/shared/types.ts`. Każdy kontrakt powstaje po uzgodnieniu producenta i odbiorców.
Zapisuj osobno wynik detektora, ocenę semantyczną i końcową decyzję polityki.

Dostawca semantyczny ma wymienialny interfejs w rodzaju `DecisionProvider`.
Laya, lokalny LLM, zdalny LLM i mock mogą być implementacjami. Lokalna klasyfikacja
jest obecnym kierunkiem ze względu na prywatność, koszt, opóźnienie i demo offline;
żaden dostawca nie staje się wymaganiem produktu.

## Audyt, raporty i telemetria

Podstawą jest zapis zdarzeń zawierający czas, trace ID, aktora, agenta, model, narzędzie,
wersję polityki, fakty deterministyczne, wynik semantyczny z pewnością, werdykt, powód,
opóźnienie, wpływ na budżet, metadane wejścia/normalizacji i szczegóły redakcji.
Ograniczamy przechowywanie surowych sekretów i danych wrażliwych w audycie.

Widok zarządczy agreguje bezpieczeństwo, interakcje, blokady/redakcje, incydenty,
koszty, trendy i użycie przez aplikacje/agentów. Widok techniczny umożliwia analizę
konkretnego trace'a i eksport, gdy praktyczny. Telemetria obejmuje narzut całości,
czas kontroli deterministycznych i semantycznych, P50/P95/P99, throughput,
udziały werdyktów, tokeny/koszt i zasoby lokalnego modelu, gdy można je zmierzyć.
Raportujemy wyłącznie wyniki faktycznych testów.

## Zakres i otwarte decyzje

Nie dodajemy Kubernetes, Kafki, kolejek rozproszonych, wielu frameworków agentowych,
vector DB, blockchaina, własnej platformy logowania, pełnej automatyzacji bankowej,
Excela/PowerPointa ani infrastruktury enterprise bez konkretnego wymagania.
Priorytetem są działająca kontrola, mały narzut, konfiguracja, audyt i testowalność.
Otwarte decyzje są w [SPEC](../SPEC.md#open-questions); nie należy ich domykać przy okazji małych zmian.
