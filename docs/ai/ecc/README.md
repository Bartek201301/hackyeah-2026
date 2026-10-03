# Skille ECC dla zespołu

Trzy skille pomagają sprawdzić bazę, bezpieczeństwo i demo. Są zapisane w Git,
więc każdy członek zespołu otrzymuje tę samą wersję razem z gałęzią lub po scaleniu PR.
Nie wymagają globalnego pluginu ECC, dodatkowych pakietów npm ani kluczy API.

## Jak używać

Otwórz checkout projektu w Codex lub Claude Code. Po pobraniu zmian skille Codex powinny
być dostępne w kolejnej turze; jeśli lista ich nie pokazuje, rozpocznij nową sesję w tym checkoutcie.
W Claude Code można wywołać je przez `/hackyeah-db-review`, `/hackyeah-security-review`
lub `/hackyeah-browser-qa`. W obu narzędziach działają też jawne prośby:

| Skill                      | Kiedy                                                   | Przykład wiadomości                                                                                                      |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hackyeah-db-review`       | Przed PR ze zmianą migracji, zapytania lub RLS          | „Użyj hackyeah-db-review do przeglądu tej migracji. Zgłoś konkretne problemy; nie wykonuj jej w bazie.”                  |
| `hackyeah-security-review` | Przy walidacji, uprawnieniach, uploadzie lub integracji | „Użyj hackyeah-security-review do sprawdzenia mojego featura przed PR.”                                                  |
| `hackyeah-browser-qa`      | Po zmianie UI i przed pokazem                           | „Użyj hackyeah-browser-qa na podanym preview. Sprawdź widok mobilny, nawigację i stany ekranu; na początek bez zapisów.” |

Przy zadaniach pasujących do tych zastosowań agent może dobrać skill samodzielnie.
Jawna nazwa pomaga wybrać naszą wersję, gdy ktoś ma także globalny plugin `ecc`.
Inny asystent może przeczytać wskazany plik `SKILL.md` bez instalowania pluginu.

## Co jest wspólne

- `.agents/skills/hackyeah-*/SKILL.md` — właściwe instrukcje projektu, wykrywane przez Codex.
- `.claude/skills/hackyeah-*/SKILL.md` — krótkie wejścia Claude Code odsyłające do tych samych instrukcji.
- `docs/ai/ecc/upstream/` — trzy oryginalne materiały ECC w języku angielskim, ładowane tylko w razie potrzeby.
- `source.json` i `LICENSE` — źródło, przypięty commit, sumy plików i licencja MIT.

Używamy zwykłych plików, bez dowiązań symbolicznych i ścieżek do komputera autora.
Własne instrukcje mają prefiks `hackyeah-`, więc nie zastępują globalnych skilli ECC.
Nie instalujemy hooków, MCP, pamięci, agentów ani automatycznych aktualizacji ECC.
Dotychczasowy hook formatowania i kontrole projektu pozostają obowiązujące.

## Zasady użycia

Źródłem zasad zespołu są [AGENTS.md](../../../AGENTS.md) i [SPEC.md](../../../SPEC.md).
Przegląd korzysta tylko z fragmentów ECC istotnych dla naszego zadania. Przykładowe
pakiety, schematy SQL, komendy i odnośniki do agentów w materiałach upstream nie
oznaczają, że te narzędzia są zainstalowane lub że mamy je dodać. Względne linki
wewnątrz oryginałów odnoszą się do repozytorium ECC, nie do naszego checkoutu.

Local, preview i production korzystają z jednej bazy Supabase. Testy formularzy mogą
zmieniać wspólne dane także na preview. Używamy uzgodnionych rekordów testowych;
resety i migracje prowadzi integrator według AGENTS.md. Brak dostępu do przeglądarki,
kont testowych lub bazy należy zgłosić jako ograniczenie sprawdzenia.
Sam skill jest instrukcją — nie instaluje przeglądarki ani nie zapewnia połączenia z usługami.

`npm run check:fast`, `npm run check`, CI i próba demo nadal służą do weryfikacji.
Raport agenta powinien oddzielać znalezione błędy, wykonane kontrole i elementy niesprawdzone.

## Źródło i aktualizacja

Pobrano z [affaan-m/ECC](https://github.com/affaan-m/ECC), wydanie **v2.2.3**,
commit [`c05b2d6614f62f6db0047669aa4eefb223d478f9`](https://github.com/affaan-m/ECC/tree/c05b2d6614f62f6db0047669aa4eefb223d478f9).
Oryginały zachowujemy bez zmian i bez formatowania; polskie dostosowania są w instrukcjach projektu.

Integrator aktualizuje je przez osobny PR: pobiera wybrane trzy katalogi z konkretnego
commita do katalogu tymczasowego, przegląda różnice, zastępuje oryginały i aktualizuje
`source.json` oraz instrukcje, jeśli potrzeba. Sprawdza licencję, sumy SHA-256,
odnośniki obu asystentów i uruchamia `npm run check`. Nie uruchamia pełnego instalatora ECC.

Ścieżki odkrywania skilli potwierdzają dokumentacje
[Codex](https://developers.openai.com/codex/skills/) i
[Claude Code](https://code.claude.com/docs/en/skills).
