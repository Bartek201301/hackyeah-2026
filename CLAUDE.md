@AGENTS.md

# Claude Code

Wspólne zasady, role i komendy znajdują się w AGENTS.md. Przed pracą czytaj też SPEC.md
i odpowiednią część docs/ARCHITECTURE.md. Rdzeniem jest AI Control Layer; demo pozostaje klientem.
Hook w .claude/settings.json formatuje edytowany plik jako wygoda; nie zastępuje
`npm run format:check` ani CI. Jeśli nie zadziała, użyj `npm run format -- <plik>`.
Nie zmieniaj konfiguracji hooka poza zadaniem integratora.
