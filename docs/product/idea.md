# Opis pomysłu — AI Control Layer

**Obecna koncepcja, nie opis gotowej implementacji.** Budujemy lekki punkt kontroli,
który programista może wpiąć między aplikację, agenta, MCP, narzędzie, API, model i zasób.
Każda objęta ochroną interakcja przechodzi przez wspólną politykę. Warstwa może działać
jako gateway, proxy, middleware lub wrapper SDK; wybór interfejsu zależy od pierwszego
działającego wycinka. Aplikacja pokazowa dowodzi integracji, lecz nie jest rdzeniem produktu.

Przykład: agent prosi o odczyt dokumentu i wysłanie podsumowania przez narzędzie HTTP.
Warstwa sprawdza tożsamość agenta i dostęp do dokumentu lub pamięci, wykrywa sekrety i dane osobowe,
ocenia semantyczne ryzyko eksfiltracji, porównuje koszt z budżetem oraz sprawdza aktualny
feed zagrożeń. Centralna polityka wydaje `ALLOW`, `WARN`, `REDACT`, `BLOCK`, `ESCALATE`
lub `ROUTE`. Kod egzekwuje decyzję przed wykonaniem działania i zapisuje ślad audytowy.
Kontroluje też odpowiedź przed zwróceniem jej odbiorcy. Ocena modelu jest sygnałem,
nie źródłem uprawnień. Ten sam mechanizm obsłuży agenta programistycznego,
asystenta dokumentów lub demo bankowe.

## Jak pomysł odpowiada na oficjalne zadanie

| Wymaganie / rezultat                      | Planowany sposób spełnienia i dowód dla sędziów                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funkcjonalna, łatwa do integracji warstwa | Jeden punkt przechwycenia żądań i działań oraz adapter do agenta/klienta; prosta ścieżka dozwolona i blokowana, diagram w [architekturze](architecture.md).                                             |
| Centralny silnik polityki                 | Jeden edytowalny plik lub równoważne źródło z aktywnymi kontrolami, progami, dozwolonymi modelami/narzędziami, rolami i budżetami. Zmiana konfiguracji ma zmienić werdykt przewidywalnie.               |
| Hybrydowe zabezpieczenia                  | Deterministyczne sprawdzenia tożsamości, dostępu, pamięci, PII/sekretów, limitów i sygnatur wraz z wymienną oceną semantyczną prompt injection, eksfiltracji i ryzyka działań; filtr wejścia i wyjścia. |
| Budżety i zasoby                          | Limity tokenów, kosztu API, żądań, czasu/compute i pętli agenta; blokada, ograniczenie lub routing przy wyczerpaniu. Uwzględniamy modele lokalne i komercyjne.                                          |
| Historyczne ataki i feedy                 | Konfigurowalne sygnatury z zewnętrznie zarządzanego źródła, m.in. złośliwe wykonanie kodu, niebezpieczna deserializacja i wskaźniki łańcucha dostaw modeli.                                             |
| Raportowanie dla dwóch odbiorców          | Interaktywny dashboard pokazuje kontrole, stan bezpieczeństwa, blokady i zużycie; eksportowalny audyt pozwala analizować trace, politykę, przyczynę i naruszenia.                                       |
| Samodzielne testowanie                    | Jedna udokumentowana komenda uruchamia przypadki dozwolone i blokowane, redakcję, budżety, exploity oraz zmianę progów i feedów. Sędziowie mogą też wysłać własne żądania.                              |
| Wydajność                                 | Pomiary opóźnienia całego żądania i narzutu warstwy, kontroli deterministycznych i semantycznych, P50/P95/P99 oraz przepustowości. Wyniki podajemy dopiero po testach.                                  |
| Praca bez płatnych usług                  | Lokalny model do demonstracji semantycznej i mock do deterministycznych testów; własne przypadki, bez wymaganej subskrypcji API ani specjalnego sprzętu.                                                |

## Pokaz i stan

Proponowany pokaz łączy zwykłe dozwolone działanie, próbę niedozwolonego transferu,
zmianę progu lub feedu przez sędziego, ponowne wykonanie żądania i analizę wyniku
w dashboardzie oraz eksporcie audytu. Diagram i wymagania są już opisane w repozytorium.
**Warstwa, przykładowa konfiguracja, dashboard, testy bezpieczeństwa i pomiary nie są
jeszcze zaimplementowane.** Ich braków nie zastępuje skrypt prezentacyjny.

Nazwa produktu, domena demo, dostawca semantyczny, format polityki i topologia pozostają
otwarte. Szczegółowe wymagania oraz wagi oceny są w [wymaganiach](requirements.md).
