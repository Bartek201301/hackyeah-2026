# Narzędzia agentów na komputerach zespołu

Po sklonowaniu repo i instalacji Node/npm z [setup](setup.md) uruchom:

```sh
npm ci
npm run setup:agent-tools
```

Druga komenda działa na macOS i Linuksie. Pobiera lub konfiguruje trzy narzędzia:

| Narzędzie                                              | Co dostaje zespół                                                          | Zakres                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------- |
| [CodeGraph](https://github.com/colbymchenry/codegraph) | Przypięty pakiet z `package-lock.json`, indeks kodu i MCP dla Codex/Claude | Ten projekt                                   |
| [Agent Reach](agent-reach.md)                          | CLI, dostępne kanały i skille lokalnych asystentów                         | Każdy komputer osobno                         |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Plugin dla wykrytego Codex i/lub Claude Code                               | Codex: konto użytkownika; Claude: ten projekt |

CodeGraph instaluje się przez `npm ci`. Jego indeks w `.codegraph/` powstaje na
każdym komputerze osobno i jest ignorowany przez Git. Konfiguracje
[Codex](../../.codex/config.toml) i [Claude](../../.mcp.json) uruchamiają lokalny
pakiet przez npm; telemetria CodeGraph jest wyłączona dla tych uruchomień.
Sprawdź wynik przez `npm run codegraph:status`. Po pierwszej instalacji uruchom
asystenta ponownie i zaufaj temu projektowi, jeśli asystent o to poprosi.

Ponytail jest pobierany przez menedżer pluginów asystenta. Skrypt przypina
marketplace Codex do sprawdzonej rewizji; ustawienia projektu Claude zapisano w
`.claude/settings.json`. Po instalacji Codex otwórz `/hooks`, przejrzyj dwa
hooki Ponytail i włącz je, jeśli chcesz korzystać z pełnego pluginu. Zmiany
w repo nie uruchamiają pluginu automatycznie na cudzym komputerze.

Na Windows wykonaj `npm ci`, potem w PowerShell:

```powershell
npm exec --no -- codegraph init --yes
codex plugin marketplace add DietrichGebert/ponytail --ref c982cd411abb53323c4baa1baa3c2f020b8d0b08
codex plugin add ponytail@ponytail
claude plugin marketplace add --scope project https://github.com/DietrichGebert/ponytail.git
claude plugin install --scope project ponytail@ponytail
```

Uruchom tylko polecenia dla asystentów, których używasz. Instalację Agent Reach
na Windows opisuje [osobna instrukcja](agent-reach.md). Żadne konto, token,
cookie ani lokalny indeks nie trafiają do Git.
