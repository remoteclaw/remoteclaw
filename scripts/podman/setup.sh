#!/usr/bin/env bash
# One-time host setup for rootless RemoteClaw in Podman: creates the remoteclaw
# user, builds the image, loads it into that user's Podman store, and installs
# the launch script. Run from repo root with sudo capability.
#
# Usage: ./scripts/podman/setup.sh [--quadlet|--container]
#   --quadlet   Install systemd Quadlet so the container runs as a user service
#   --container Only install user + image + launch script; you start the container manually (default)
#   Or set REMOTECLAW_PODMAN_QUADLET=1 (or 0) to choose without a flag.
#
# After this, start the gateway manually:
#   ./scripts/run-remoteclaw-podman.sh launch
#   ./scripts/run-remoteclaw-podman.sh launch setup   # onboarding wizard
# Or as the remoteclaw user: sudo -u remoteclaw /home/remoteclaw/run-remoteclaw-podman.sh
# If you used --quadlet, you can also: sudo systemctl --machine remoteclaw@ --user start remoteclaw.service
set -euo pipefail

REMOTECLAW_USER="${REMOTECLAW_PODMAN_USER:-remoteclaw}"
REPO_PATH="${REMOTECLAW_REPO_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RUN_SCRIPT_SRC="$REPO_PATH/scripts/run-remoteclaw-podman.sh"
QUADLET_TEMPLATE="$REPO_PATH/scripts/podman/remoteclaw.container.in"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

is_writable_dir() {
  local dir="$1"
  [[ -n "$dir" && -d "$dir" && ! -L "$dir" && -w "$dir" && -x "$dir" ]]
}

is_safe_tmp_base() {
  local dir="$1"
  local mode=""
  local owner=""
  is_writable_dir "$dir" || return 1
  mode="$(stat -Lc '%a' "$dir" 2>/dev/null || true)"
  if [[ -n "$mode" ]]; then
    local perm=$((8#$mode))
    if (( (perm & 0022) != 0 && (perm & 01000) == 0 )); then
      return 1
    fi
  fi
  if is_root; then
    owner="$(stat -Lc '%u' "$dir" 2>/dev/null || true)"
    if [[ -n "$owner" && "$owner" != "0" ]]; then
      return 1
    fi
  fi
  return 0
}

resolve_image_tmp_dir() {
  if ! is_root && is_safe_tmp_base "${TMPDIR:-}"; then
    printf '%s' "$TMPDIR"
    return 0
  fi
  if is_safe_tmp_base "/var/tmp"; then
    printf '%s' "/var/tmp"
    return 0
  fi
  if is_safe_tmp_base "/tmp"; then
    printf '%s' "/tmp"
    return 0
  fi
  printf '%s' "/tmp"
}

is_root() { [[ "$(id -u)" -eq 0 ]]; }

run_root() {
  if is_root; then
    "$@"
  else
    sudo "$@"
  fi
}

run_as_user() {
  # When switching users, the caller's cwd may be inaccessible to the target
  # user (e.g. a private home dir). Wrap in a subshell that cd's to a
  # world-traversable directory so sudo/runuser don't fail with "cannot chdir".
  # TODO: replace with fully rootless podman build to eliminate the need for
  # user-switching entirely.
  local user="$1"
  shift
  if command -v sudo >/dev/null 2>&1; then
    ( cd /tmp 2>/dev/null || cd /; sudo -u "$user" "$@" )
  elif is_root && command -v runuser >/dev/null 2>&1; then
    ( cd /tmp 2>/dev/null || cd /; runuser -u "$user" -- "$@" )
  else
    echo "Need sudo (or root+runuser) to run commands as $user." >&2
    exit 1
  fi
}

run_as_remoteclaw() {
  # Avoid root writes into $REMOTECLAW_HOME (symlink/hardlink/TOCTOU footguns).
  # Anything under the target user's home should be created/modified as that user.
  run_as_user "$REMOTECLAW_USER" env HOME="$REMOTECLAW_HOME" "$@"
}

escape_sed_replacement_pipe_delim() {
  # Escape replacement metacharacters for sed "s|...|...|g" replacement text.
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

# Quadlet: opt-in via --quadlet or REMOTECLAW_PODMAN_QUADLET=1
INSTALL_QUADLET=false
for arg in "$@"; do
  case "$arg" in
    --quadlet)   INSTALL_QUADLET=true ;;
    --container) INSTALL_QUADLET=false ;;
  esac
done
if [[ -n "${REMOTECLAW_PODMAN_QUADLET:-}" ]]; then
  case "${REMOTECLAW_PODMAN_QUADLET,,}" in
    1|yes|true)  INSTALL_QUADLET=true ;;
    0|no|false) INSTALL_QUADLET=false ;;
  esac
fi

require_cmd podman
if ! is_root; then
  require_cmd sudo
fi
if [[ ! -f "$REPO_PATH/Dockerfile" ]]; then
  echo "Dockerfile not found at $REPO_PATH. Set REMOTECLAW_REPO_PATH to the repo root." >&2
  exit 1
fi
if [[ ! -f "$RUN_SCRIPT_SRC" ]]; then
  echo "Launch script not found at $RUN_SCRIPT_SRC." >&2
  exit 1
fi

generate_token_hex_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return 0
  fi
  if command -v od >/dev/null 2>&1; then
    # 32 random bytes -> 64 lowercase hex chars
    od -An -N32 -tx1 /dev/urandom | tr -d " \n"
    return 0
  fi
  echo "Missing dependency: need openssl or python3 (or od) to generate REMOTECLAW_GATEWAY_TOKEN." >&2
  exit 1
}

user_exists() {
  local user="$1"
  if command -v getent >/dev/null 2>&1; then
    getent passwd "$user" >/dev/null 2>&1 && return 0
  fi
  id -u "$user" >/dev/null 2>&1
}

resolve_user_home() {
  local user="$1"
  local home=""
  if command -v getent >/dev/null 2>&1; then
    home="$(getent passwd "$user" 2>/dev/null | cut -d: -f6 || true)"
  fi
  if [[ -z "$home" && -f /etc/passwd ]]; then
    home="$(awk -F: -v u="$user" '$1==u {print $6}' /etc/passwd 2>/dev/null || true)"
  fi
  if [[ -z "$home" ]]; then
    home="/home/$user"
  fi
  printf '%s' "$home"
}

resolve_nologin_shell() {
  for cand in /usr/sbin/nologin /sbin/nologin /usr/bin/nologin /bin/false; do
    if [[ -x "$cand" ]]; then
      printf '%s' "$cand"
      return 0
    fi
  done
  printf '%s' "/usr/sbin/nologin"
}

# Create remoteclaw user (non-login, with home) if missing
if ! user_exists "$REMOTECLAW_USER"; then
  NOLOGIN_SHELL="$(resolve_nologin_shell)"
  echo "Creating user $REMOTECLAW_USER ($NOLOGIN_SHELL, with home)..."
  if command -v useradd >/dev/null 2>&1; then
    run_root useradd -m -s "$NOLOGIN_SHELL" "$REMOTECLAW_USER"
  elif command -v adduser >/dev/null 2>&1; then
    # Debian/Ubuntu: adduser supports --disabled-password/--gecos. Busybox adduser differs.
    run_root adduser --disabled-password --gecos "" --shell "$NOLOGIN_SHELL" "$REMOTECLAW_USER"
  else
    echo "Neither useradd nor adduser found, cannot create user $REMOTECLAW_USER." >&2
    exit 1
  fi
else
  echo "User $REMOTECLAW_USER already exists."
fi

REMOTECLAW_HOME="$(resolve_user_home "$REMOTECLAW_USER")"
REMOTECLAW_UID="$(id -u "$REMOTECLAW_USER" 2>/dev/null || true)"
REMOTECLAW_CONFIG="$REMOTECLAW_HOME/.remoteclaw"
LAUNCH_SCRIPT_DST="$REMOTECLAW_HOME/run-remoteclaw-podman.sh"

# Prefer systemd user services (Quadlet) for production. Enable lingering early so rootless Podman can run
# without an interactive login.
if command -v loginctl &>/dev/null; then
  run_root loginctl enable-linger "$REMOTECLAW_USER" 2>/dev/null || true
fi
if [[ -n "${REMOTECLAW_UID:-}" && -d /run/user ]] && command -v systemctl &>/dev/null; then
  if [[ ! -d "/run/user/$REMOTECLAW_UID" ]]; then
    run_root install -d -m 700 -o "$REMOTECLAW_UID" -g "$REMOTECLAW_UID" "/run/user/$REMOTECLAW_UID" || true
  fi
  run_root mkdir -p "/run/user/$REMOTECLAW_UID/containers" || true
  run_root chown "$REMOTECLAW_UID:$REMOTECLAW_UID" "/run/user/$REMOTECLAW_UID/containers" || true
  run_root chmod 700 "/run/user/$REMOTECLAW_UID/containers" || true
fi

mkdir_user_dirs_as_remoteclaw() {
  run_root install -d -m 700 -o "$REMOTECLAW_UID" -g "$REMOTECLAW_UID" "$REMOTECLAW_HOME" "$REMOTECLAW_CONFIG"
  run_root install -d -m 700 -o "$REMOTECLAW_UID" -g "$REMOTECLAW_UID" "$REMOTECLAW_CONFIG/workspace"
}

ensure_subid_entry() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  grep -q "^${REMOTECLAW_USER}:" "$file" 2>/dev/null
}

if ! ensure_subid_entry /etc/subuid || ! ensure_subid_entry /etc/subgid; then
  echo "WARNING: ${REMOTECLAW_USER} may not have subuid/subgid ranges configured." >&2
  echo "If rootless Podman fails, add 'remoteclaw:100000:65536' to both /etc/subuid and /etc/subgid." >&2
fi

mkdir_user_dirs_as_remoteclaw

IMAGE_TMP_BASE="$(resolve_image_tmp_dir)"
echo "Using temp base for image export: $IMAGE_TMP_BASE"
IMAGE_TAR_DIR="$(mktemp -d "${IMAGE_TMP_BASE%/}/remoteclaw-podman-image.XXXXXX")"
chmod 700 "$IMAGE_TAR_DIR"
IMAGE_TAR="$IMAGE_TAR_DIR/remoteclaw-image.tar"
cleanup_image_tar() {
  rm -rf "$IMAGE_TAR_DIR"
}
trap cleanup_image_tar EXIT

BUILD_ARGS=()
if [[ -n "${REMOTECLAW_DOCKER_APT_PACKAGES:-}" ]]; then
  BUILD_ARGS+=(--build-arg "REMOTECLAW_DOCKER_APT_PACKAGES=${REMOTECLAW_DOCKER_APT_PACKAGES}")
fi
if [[ -n "${REMOTECLAW_EXTENSIONS:-}" ]]; then
  BUILD_ARGS+=(--build-arg "REMOTECLAW_EXTENSIONS=${REMOTECLAW_EXTENSIONS}")
fi

echo "Building image remoteclaw:local..."
podman build -t remoteclaw:local -f "$REPO_PATH/Dockerfile" "${BUILD_ARGS[@]}" "$REPO_PATH"
echo "Saving image to $IMAGE_TAR ..."
podman save -o "$IMAGE_TAR" remoteclaw:local

echo "Loading image into $REMOTECLAW_USER Podman store..."
run_as_remoteclaw podman load -i "$IMAGE_TAR"

echo "Installing launch script to $LAUNCH_SCRIPT_DST ..."
run_root install -m 0755 -o "$REMOTECLAW_UID" -g "$REMOTECLAW_UID" "$RUN_SCRIPT_SRC" "$LAUNCH_SCRIPT_DST"

if [[ ! -f "$REMOTECLAW_CONFIG/.env" ]]; then
  TOKEN="$(generate_token_hex_32)"
  run_as_remoteclaw sh -lc "umask 077 && printf '%s\n' 'REMOTECLAW_GATEWAY_TOKEN=$TOKEN' > '$REMOTECLAW_CONFIG/.env'"
  echo "Generated REMOTECLAW_GATEWAY_TOKEN and wrote it to $REMOTECLAW_CONFIG/.env"
fi

if [[ ! -f "$REMOTECLAW_CONFIG/remoteclaw.json" ]]; then
  run_as_remoteclaw sh -lc "umask 077 && cat > '$REMOTECLAW_CONFIG/remoteclaw.json' <<'JSON'
{ \"gateway\": { \"mode\": \"local\" } }
JSON"
  echo "Wrote minimal config to $REMOTECLAW_CONFIG/remoteclaw.json"
fi

if [[ "$INSTALL_QUADLET" == true ]]; then
  QUADLET_DIR="$REMOTECLAW_HOME/.config/containers/systemd"
  QUADLET_DST="$QUADLET_DIR/remoteclaw.container"
  echo "Installing Quadlet to $QUADLET_DST ..."
  run_as_remoteclaw mkdir -p "$QUADLET_DIR"
  REMOTECLAW_HOME_ESCAPED="$(escape_sed_replacement_pipe_delim "$REMOTECLAW_HOME")"
  sed "s|{{REMOTECLAW_HOME}}|$REMOTECLAW_HOME_ESCAPED|g" "$QUADLET_TEMPLATE" | \
    run_as_remoteclaw sh -lc "cat > '$QUADLET_DST'"
  run_as_remoteclaw chmod 0644 "$QUADLET_DST"

  echo "Reloading and enabling user service..."
  run_root systemctl --machine "${REMOTECLAW_USER}@" --user daemon-reload
  run_root systemctl --machine "${REMOTECLAW_USER}@" --user enable --now remoteclaw.service
  echo "Quadlet installed and service started."
else
  echo "Container + launch script installed."
fi

echo
echo "Next:"
echo "  ./scripts/run-remoteclaw-podman.sh launch"
echo "  ./scripts/run-remoteclaw-podman.sh launch setup"
