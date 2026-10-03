# Agent Reach na komputerach zespołu

Agent Reach to narzędzie dla lokalnych asystentów, a nie zależność aplikacji Next.js.
Repozytorium zawiera powtarzalną komendę instalacji; `git pull` sam nie instaluje
programów na cudzym komputerze. Każda osoba uruchamia instalację u siebie.

## Instalacja

Wymagane są Python 3.10+, [uv](https://docs.astral.sh/uv/getting-started/installation/),
Node.js z npm oraz [GitHub CLI](https://cli.github.com/). W tym projekcie Node i npm są
już potrzebne do aplikacji. Skrypt używa przypiętej rewizji źródła Agent Reach i
instaluje wszystkie kanały obsługiwane przez jego instalator.

macOS / Linux, w katalogu repo:

```sh
bash scripts/install-agent-reach.sh
```

Windows, w PowerShell po instalacji wymaganych narzędzi:

```powershell
uv tool install --force --from "git+https://github.com/Panniantong/agent-reach.git@a19a171fa980a0785849596492e0af4db800c82f" agent-reach
agent-reach install --env=auto --system --channels=all
agent-reach doctor
```

Jeżeli `agent-reach` nie jest widoczny w terminalu, dodaj katalog zwrócony przez
`uv tool dir --bin` do `PATH` i otwórz nowy terminal. Na macOS/Linux skrypt uruchamia
program bezpośrednio z tego katalogu.

Instalacja może dołożyć globalne narzędzia npm/uv, konfigurację w katalogu domowym
oraz skill dla lokalnych asystentów. Nie uruchamia się podczas `npm ci`, buildu ani CI.
Źródło i opis działania: [oficjalna instrukcja Agent Reach](https://github.com/Panniantong/agent-reach/blob/main/docs/install.md).

## Konta i sprawdzenie

Instalator nie odczytuje automatycznie sesji przeglądarki. Część kanałów, m.in. X,
Reddit, Instagram i LinkedIn, wymaga osobnego logowania, rozszerzenia przeglądarki
lub klucza API. Dla kanałów opartych na OpenCLI trzeba samodzielnie dodać
[rozszerzenie Chrome/Edge](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk).
Transkrypcja podcastów wymaga własnego klucza Groq. `agent-reach doctor` pokaże,
co działa na danym komputerze i jakie kroki pozostały. Pomyślna instalacja nie
oznacza aktywacji wszystkich kanałów; dostępność zależy też od regionu i sieci.

Konfiguruj tylko własne konta, świadomie i według wskazówek `doctor`. Nie kopiuj
cookies, tokenów, kluczy ani plików z `~/.agent-reach/` do repo, PR lub czatu zespołu.
Stan instalacji i logowania na jednej maszynie nie oznacza, że pozostałe maszyny są gotowe.
