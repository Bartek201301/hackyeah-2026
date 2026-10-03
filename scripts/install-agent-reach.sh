#!/usr/bin/env bash
set -euo pipefail

# Keep the CLI installation on the same reviewed upstream revision for the team.
AGENT_REACH_SOURCE="git+https://github.com/Panniantong/agent-reach.git@a19a171fa980a0785849596492e0af4db800c82f"

for dependency in uv gh node npm; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Missing %s. See docs/team/agent-reach.md for prerequisites.\n' "$dependency" >&2
    exit 1
  fi
done

uv tool install --force --from "$AGENT_REACH_SOURCE" agent-reach

agent_reach_bin="$(uv tool dir --bin)/agent-reach"
if [[ ! -x "$agent_reach_bin" ]]; then
  printf 'Agent Reach executable was not found at %s.\n' "$agent_reach_bin" >&2
  exit 1
fi

"$agent_reach_bin" install --env=auto --system --channels=all
"$agent_reach_bin" doctor
