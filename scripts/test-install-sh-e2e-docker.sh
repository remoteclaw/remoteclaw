#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-build.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-container.sh"
IMAGE_NAME="${REMOTECLAW_INSTALL_E2E_IMAGE:-remoteclaw-install-e2e:local}"
INSTALL_URL="${REMOTECLAW_INSTALL_URL:-https://remoteclaw.bot/install.sh}"
DOCKER_COMMAND_TIMEOUT="${DOCKER_COMMAND_TIMEOUT:-${REMOTECLAW_INSTALL_E2E_DOCKER_TIMEOUT:-2700s}}"
PROFILE_FILE="${REMOTECLAW_INSTALL_E2E_PROFILE_FILE:-${REMOTECLAW_PROFILE_FILE:-${REMOTECLAW_TESTBOX_PROFILE_FILE:-$HOME/.remoteclaw-testbox-live.profile}}}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
REMOTECLAW_E2E_MODELS="${REMOTECLAW_E2E_MODELS:-}"

if [ ! -f "$PROFILE_FILE" ] && [ -f "$HOME/.profile" ]; then
  PROFILE_FILE="$HOME/.profile"
fi

PROFILE_STATUS="none"

read_profile_env_value() {
  local key="$1"
  (
    set +u
    # shellcheck disable=SC1090
    source "$PROFILE_FILE" >/dev/null
    printf '%s' "${!key:-}"
  )
}

for key in OPENAI_API_KEY ANTHROPIC_API_KEY ANTHROPIC_API_TOKEN; do
  if [ -f "$PROFILE_FILE" ] && [ -r "$PROFILE_FILE" ] && [ -z "${!key:-}" ]; then
    printf -v "$key" '%s' "$(read_profile_env_value "$key")"
    PROFILE_STATUS="$PROFILE_FILE"
  fi
  if [[ "${!key:-}" == "undefined" || "${!key:-}" == "null" ]]; then
    printf -v "$key" '%s' ""
  fi
  export "$key"
done

echo "==> Build image: $IMAGE_NAME"
docker_build_run install-e2e-build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker"

echo "==> Run E2E installer test"
echo "Profile file: $PROFILE_STATUS"
docker_e2e_docker_run_cmd run --rm \
  -e REMOTECLAW_INSTALL_URL="$INSTALL_URL" \
  -e REMOTECLAW_INSTALL_TAG="${REMOTECLAW_INSTALL_TAG:-latest}" \
  -e REMOTECLAW_E2E_MODELS="$REMOTECLAW_E2E_MODELS" \
  -e REMOTECLAW_INSTALL_E2E_OPENAI_MODEL="${REMOTECLAW_INSTALL_E2E_OPENAI_MODEL:-}" \
  -e REMOTECLAW_INSTALL_E2E_OPENAI_PROVIDER_TIMEOUT_SECONDS="${REMOTECLAW_INSTALL_E2E_OPENAI_PROVIDER_TIMEOUT_SECONDS:-}" \
  -e REMOTECLAW_INSTALL_E2E_PREVIOUS="${REMOTECLAW_INSTALL_E2E_PREVIOUS:-}" \
  -e REMOTECLAW_INSTALL_E2E_SKIP_PREVIOUS="${REMOTECLAW_INSTALL_E2E_SKIP_PREVIOUS:-0}" \
  -e REMOTECLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS="${REMOTECLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS:-300}" \
  -e REMOTECLAW_INSTALL_E2E_AGENT_TURNS_PARALLEL="${REMOTECLAW_INSTALL_E2E_AGENT_TURNS_PARALLEL:-1}" \
  -e REMOTECLAW_INSTALL_E2E_AGENT_TOOL_SMOKE="${REMOTECLAW_INSTALL_E2E_AGENT_TOOL_SMOKE:-1}" \
  -e REMOTECLAW_NO_ONBOARD=1 \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  -e ANTHROPIC_API_TOKEN \
  "$IMAGE_NAME"
