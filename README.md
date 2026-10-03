# hackyeah-2026

Wyzwanie HackYeah / Goldman Sachs **AI Control Layer**: konfigurowalna warstwa kontroli
interakcji aplikacji, agentów, modeli, MCP, narzędzi i danych. Obecny kod jest szkieletem
Next.js App Router + Supabase + Vercel, a nie działającą warstwą kontroli.
Trzech builderów, jeden integrator; podział funkcji pozostaje do uzgodnienia.

1. Node **24.14.1** (plik `.nvmrc`), npm **11.11.0** (`npm install -g npm@11.11.0`).
2. `npm ci`
3. `cp .env.example .env.local` — wartości projektu od integratora, poza Git.
4. `npm run doctor`, następnie `npm run dev` i http://localhost:3000/health.

- Zasady dla wszystkich narzędzi: [AGENTS.md](AGENTS.md).
- Zadanie, podział funkcji i kontrakty: [wymagania](docs/product/requirements.md).
- Opis pomysłu i mapa wymagań: [idea](docs/product/idea.md).
- Przepływ, niezmienniki i otwarte granice: [architektura](docs/product/architecture.md).
- Konfiguracja usług i potwierdzenia zespołu: [setup](docs/team/setup.md).
- Jedna konfiguracja narzędzi zespołu: [CodeGraph, Agent Reach i Ponytail](docs/team/agent-tools.md).
- Uzasadnienie: [decyzje](docs/team/decisions.md).
- Wspólne skille AI: [instrukcja ECC](docs/ai/ecc/README.md) — przegląd bazy,
  bezpieczeństwa i demo w przeglądarce. Codex i Claude Code dostają je razem z repo;
  instalacja globalnego pluginu nie jest potrzebna.

Przed małym commitem: `npm run check:fast`. Przed PR i po znaczącej zmianie: `npm run check`.
Kontrole działają bez bazy i kluczy. `npm run doctor` sprawdza konfigurację i połączenie osobno.
Formatuj własne pliki: `npm run format -- <plik1> <plik2>`.

Nowa praca: osobna gałąź `codex/<zadanie>`, PR, jedna akceptacja kolegi, scalenie przez integratora.
Local, preview i production korzystają z **jednej bazy** — tylko integrator wykonuje migracje i resety.
Strony techniczne: `/ui` (komponenty), `/health` (diagnostyka).
