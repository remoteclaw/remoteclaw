#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${REMOTECLAW_IMAGE:-remoteclaw:local}"
LIVE_IMAGE_NAME="${REMOTECLAW_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${REMOTECLAW_CONFIG_DIR:-$HOME/.remoteclaw}"
WORKSPACE_DIR="${REMOTECLAW_WORKSPACE_DIR:-$HOME/.remoteclaw/workspace}"
PROFILE_FILE="${REMOTECLAW_PROFILE_FILE:-$HOME/.profile}"
TEMP_DIRS=()
DOCKER_USER="${REMOTECLAW_DOCKER_USER:-node}"

cleanup_temp_dirs() {
  if ((${#TEMP_DIRS[@]} > 0)); then
    rm -rf "${TEMP_DIRS[@]}"
  fi
}
trap cleanup_temp_dirs EXIT

if [[ -n "${REMOTECLAW_DOCKER_CLI_TOOLS_DIR:-}" ]]; then
  CLI_TOOLS_DIR="${REMOTECLAW_DOCKER_CLI_TOOLS_DIR}"
elif [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  CLI_TOOLS_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/remoteclaw-docker-cli-tools.XXXXXX")"
  TEMP_DIRS+=("$CLI_TOOLS_DIR")
else
  CLI_TOOLS_DIR="$HOME/.cache/remoteclaw/docker-cli-tools"
fi
if [[ -n "${REMOTECLAW_DOCKER_CACHE_HOME_DIR:-}" ]]; then
  CACHE_HOME_DIR="${REMOTECLAW_DOCKER_CACHE_HOME_DIR}"
elif [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  CACHE_HOME_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/remoteclaw-docker-cache.XXXXXX")"
  TEMP_DIRS+=("$CACHE_HOME_DIR")
else
  CACHE_HOME_DIR="$HOME/.cache/remoteclaw/docker-cache"
fi

mkdir -p "$CLI_TOOLS_DIR"
mkdir -p "$CACHE_HOME_DIR"
if [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  DOCKER_USER="$(id -u):$(id -g)"
fi

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

AUTH_FILES=()
while IFS= read -r auth_file; do
  [[ -n "$auth_file" ]] || continue
  AUTH_FILES+=("$auth_file")
done < <(remoteclaw_live_collect_auth_files_from_csv "openai-codex")

AUTH_FILES_CSV=""
if ((${#AUTH_FILES[@]} > 0)); then
  AUTH_FILES_CSV="$(remoteclaw_live_join_csv "${AUTH_FILES[@]}")"
fi

EXTERNAL_AUTH_MOUNTS=()
if ((${#AUTH_FILES[@]} > 0)); then
  for auth_file in "${AUTH_FILES[@]}"; do
    host_path="$HOME/$auth_file"
    if [[ -f "$host_path" ]]; then
      EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth-files/"$auth_file":ro)
    fi
  done
fi

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && [ -r "$HOME/.profile" ] && source "$HOME/.profile" || true
export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export npm_config_prefix="$NPM_CONFIG_PREFIX"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export COREPACK_HOME="${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
mkdir -p "$NPM_CONFIG_PREFIX" "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" || true
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
IFS=',' read -r -a auth_files <<<"${REMOTECLAW_DOCKER_AUTH_FILES_RESOLVED:-}"
if ((${#auth_files[@]} > 0)); then
  for auth_file in "${auth_files[@]}"; do
    [ -n "$auth_file" ] || continue
    if [ -f "/host-auth-files/$auth_file" ]; then
      mkdir -p "$(dirname "$HOME/$auth_file")"
      cp "/host-auth-files/$auth_file" "$HOME/$auth_file"
      chmod u+rw "$HOME/$auth_file" || true
    fi
  done
fi
if [ ! -x "$NPM_CONFIG_PREFIX/bin/codex" ]; then
  npm install -g @openai/codex
fi
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
source /src/scripts/lib/live-docker-stage.sh
remoteclaw_live_stage_source_tree "$tmp_dir"
mkdir -p "$tmp_dir/node_modules"
cp -aRs /app/node_modules/. "$tmp_dir/node_modules"
rm -rf "$tmp_dir/node_modules/.vite-temp"
mkdir -p "$tmp_dir/node_modules/.vite-temp"
remoteclaw_live_link_runtime_tree "$tmp_dir"
remoteclaw_live_stage_state_dir "$tmp_dir/.remoteclaw-state"
remoteclaw_live_prepare_staged_config
cd "$tmp_dir"
pnpm test:live src/gateway/gateway-codex-harness.live.test.ts
EOF

"$ROOT_DIR/scripts/test-live-build-docker.sh"

echo "==> Run Codex harness live test in Docker"
echo "==> Model: ${REMOTECLAW_LIVE_CODEX_HARNESS_MODEL:-codex/gpt-5.4}"
echo "==> Image probe: ${REMOTECLAW_LIVE_CODEX_HARNESS_IMAGE_PROBE:-1}"
echo "==> MCP probe: ${REMOTECLAW_LIVE_CODEX_HARNESS_MCP_PROBE:-1}"
echo "==> Harness fallback: none"
echo "==> Auth files: ${AUTH_FILES_CSV:-none}"
docker run --rm -t \
  -u "$DOCKER_USER" \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e OPENAI_API_KEY \
  -e REMOTECLAW_AGENT_HARNESS_FALLBACK=none \
  -e REMOTECLAW_CODEX_APP_SERVER_BIN="${REMOTECLAW_CODEX_APP_SERVER_BIN:-codex}" \
  -e REMOTECLAW_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
  -e REMOTECLAW_LIVE_CODEX_HARNESS=1 \
  -e REMOTECLAW_LIVE_CODEX_HARNESS_DEBUG="${REMOTECLAW_LIVE_CODEX_HARNESS_DEBUG:-}" \
  -e REMOTECLAW_LIVE_CODEX_HARNESS_IMAGE_PROBE="${REMOTECLAW_LIVE_CODEX_HARNESS_IMAGE_PROBE:-1}" \
  -e REMOTECLAW_LIVE_CODEX_HARNESS_MCP_PROBE="${REMOTECLAW_LIVE_CODEX_HARNESS_MCP_PROBE:-1}" \
  -e REMOTECLAW_LIVE_CODEX_HARNESS_MODEL="${REMOTECLAW_LIVE_CODEX_HARNESS_MODEL:-codex/gpt-5.4}" \
  -e REMOTECLAW_LIVE_TEST=1 \
  -e REMOTECLAW_VITEST_FS_MODULE_CACHE=0 \
  -v "$CACHE_HOME_DIR":/home/node/.cache \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.remoteclaw \
  -v "$WORKSPACE_DIR":/home/node/.remoteclaw/workspace \
  -v "$CLI_TOOLS_DIR":/home/node/.npm-global \
  "${EXTERNAL_AUTH_MOUNTS[@]}" \
  "${PROFILE_MOUNT[@]}" \
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD"
