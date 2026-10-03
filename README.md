# hackyeah-2026

Next.js App Router + Supabase + Vercel. Trzech builderów, jeden integrator.

1. Node **24.14.1** (plik `.nvmrc`), npm **11.11.0** (`npm install -g npm@11.11.0`).
2. `npm ci`
3. `cp .env.example .env.local` — wartości projektu od integratora, poza Git.
4. `npm run doctor`, następnie `npm run dev` i http://localhost:3000/health.

- Zasady dla wszystkich narzędzi: [AGENTS.md](AGENTS.md).
- Zadanie, podział funkcji i kontrakty: [SPEC.md](SPEC.md).
- Konfiguracja usług i potwierdzenia zespołu: [SETUP-ME.md](SETUP-ME.md).
- Uzasadnienie: [DECYZJE.md](DECYZJE.md).
- Wspólne skille AI: [instrukcja ECC](docs/ai/ecc/README.md) — przegląd bazy,
  bezpieczeństwa i demo w przeglądarce. Codex i Claude Code dostają je razem z repo;
  instalacja globalnego pluginu nie jest potrzebna.

Przed małym commitem: `npm run check:fast`. Przed PR i po znaczącej zmianie: `npm run check`.
Kontrole działają bez bazy i kluczy. `npm run doctor` sprawdza konfigurację i połączenie osobno.
Formatuj własne pliki: `npm run format -- <plik1> <plik2>`.

Nowa praca: osobna gałąź `codex/<zadanie>`, PR, jedna akceptacja kolegi, scalenie przez integratora.
Local, preview i production korzystają z **jednej bazy** — tylko integrator wykonuje migracje i resety.
Strony techniczne: `/ui` (komponenty), `/health` (diagnostyka).
