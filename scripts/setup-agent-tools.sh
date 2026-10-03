#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -x node_modules/.bin/codegraph ]]; then
  printf 'Run npm ci before setup:agent-tools.\n' >&2
  exit 1
fi

if [[ ! -f .codegraph/codegraph.db ]]; then
  CODEGRAPH_TELEMETRY=0 npm exec --no -- codegraph init --yes
else
  CODEGRAPH_TELEMETRY=0 npm exec --no -- codegraph status
fi

bash scripts/install-agent-reach.sh

if command -v codex >/dev/null 2>&1; then
  codex plugin marketplace add DietrichGebert/ponytail --ref c982cd411abb53323c4baa1baa3c2f020b8d0b08
  codex plugin add ponytail@ponytail
fi

if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add --scope project https://github.com/DietrichGebert/ponytail.git
  claude plugin install --scope project ponytail@ponytail
fi
