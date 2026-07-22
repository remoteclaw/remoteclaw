#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${REMOTECLAW_LIVE_ACP_BIND_AGENTS:-}" && "${REMOTECLAW_LIVE_ACP_BIND_AGENTS}" != "codex" ]]; then
  echo "ERROR: ACP spawn defaults Docker test supports only REMOTECLAW_LIVE_ACP_BIND_AGENTS=codex." >&2
  exit 1
fi

export REMOTECLAW_LIVE_ACP_BIND_AGENTS=codex
export REMOTECLAW_LIVE_ACP_BIND_TEST_FILES="${REMOTECLAW_LIVE_ACP_BIND_TEST_FILES:-src/gateway/gateway-acp-spawn-defaults.live.test.ts}"
export REMOTECLAW_LIVE_ACP_SPAWN_DEFAULTS=1
export REMOTECLAW_LIVE_ACP_SPAWN_DEFAULTS_MODEL="${REMOTECLAW_LIVE_ACP_SPAWN_DEFAULTS_MODEL:-openai/gpt-5.5}"
export REMOTECLAW_LIVE_ACP_SPAWN_DEFAULTS_THINKING="${REMOTECLAW_LIVE_ACP_SPAWN_DEFAULTS_THINKING:-high}"
export REMOTECLAW_LIVE_ACP_BIND_CODEX_MODEL="${REMOTECLAW_LIVE_ACP_BIND_CODEX_MODEL:-gpt-5.5}"

exec bash "$SCRIPT_DIR/test-live-acp-bind-docker.sh"
