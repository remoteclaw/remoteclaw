#!/usr/bin/env bash
# Shared in-container lifecycle helpers for Docker/Bash E2E lanes.
remoteclaw_e2e_eval_test_state_from_b64() {
  local encoded="${1:?missing RemoteClaw test-state script}"
  local decoded
  if ! decoded="$(printf '%s' "$encoded" | base64 -d)"; then
    echo "Invalid RemoteClaw test-state base64 payload" >&2
    return 1
  fi
  if [ -z "${decoded//[[:space:]]/}" ]; then
    echo "RemoteClaw test-state base64 payload decoded to an empty script" >&2
    return 1
  fi
  eval "$decoded"
}
remoteclaw_e2e_read_positive_int_env() {
  local name="${1:?missing environment variable name}"
  local fallback="${2:?missing fallback value}"
  local value="${!name-}"
  if [ -z "${!name+x}" ]; then
    value="$fallback"
  fi
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( 10#$value < 1 )); then
    echo "invalid $name: $value" >&2
    return 2
  fi
  printf '%s\n' "$value"
}
remoteclaw_e2e_read_nonnegative_int_env() {
  local name="${1:?missing environment variable name}"
  local fallback="${2:?missing fallback value}"
  local value="${!name-}"
  if [ -z "${!name+x}" ]; then
    value="$fallback"
  fi
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "invalid $name: $value" >&2
    return 2
  fi
  printf '%s\n' "$value"
}
remoteclaw_e2e_resolve_entrypoint() {
  local entry
  for entry in dist/index.mjs dist/index.js; do
    [ -f "$entry" ] && { printf '%s\n' "$entry"; return 0; }
  done
  echo "RemoteClaw entrypoint not found under dist/" >&2
  return 1
}
remoteclaw_e2e_package_root() {
  local prefix="${1:-}"
  if [ -n "$prefix" ]; then
    printf '%s/lib/node_modules/remoteclaw\n' "$prefix"
    return 0
  fi
  printf '%s/remoteclaw\n' "$(npm root -g)"
}
remoteclaw_e2e_package_entrypoint() {
  local root="${1:?missing package root}"
  local entry
  for entry in "$root/dist/index.mjs" "$root/dist/index.js"; do
    [ -f "$entry" ] && { printf '%s\n' "$entry"; return 0; }
  done
  echo "RemoteClaw package entrypoint not found under $root/dist/" >&2
  return 1
}
remoteclaw_e2e_maybe_timeout() {
  local timeout_value="$1"
  shift
  if [ -z "$timeout_value" ] || [ "$timeout_value" = "0" ]; then
    "$@"
    return
  fi
  local timeout_bin=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_bin="gtimeout"
  fi
  if [ -z "$timeout_bin" ]; then
    if command -v node >/dev/null 2>&1; then
      echo "timeout command not found; using Node watchdog for RemoteClaw E2E command timeout $timeout_value" >&2
      if [[ "$1" != */* ]]; then
        local resolved_command
        resolved_command="$(command -v "$1" 2>/dev/null || true)"
        if [ -n "$resolved_command" ]; then
          set -- "$resolved_command" "${@:2}"
        fi
      fi
      node - "$timeout_value" "$@" <<'NODE'
const [, , timeoutValue, command, ...args] = process.argv;
const parseTimeoutMs = (value) => {
  const match = /^([0-9]+(?:\.[0-9]+)?)(ms|s|m|h)?$/u.exec(String(value ?? "").trim());
  if (!match) {
    throw new Error(`unsupported timeout value: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000;
  return Math.max(1, Math.ceil(amount * multiplier));
};
if (!command) {
  console.error("missing command for Node watchdog");
  process.exit(1);
}
const { spawn } = await import("node:child_process");
let timeoutMs;
try {
  timeoutMs = parseTimeoutMs(timeoutValue);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const child = spawn(command, args, {
  detached: process.platform !== "win32",
  env: process.env,
  stdio: "inherit",
});
let timedOut = false;
let parentSignal = null;
let parentSignalTimer = null;
const signalExitCodes = new Map([
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143],
]);
const killGraceMs = Number.parseInt(
  process.env.REMOTECLAW_E2E_TIMEOUT_KILL_GRACE_MS || "30000",
  10,
);
const killTarget = process.platform === "win32" ? child.pid : -child.pid;
const killChild = (signal) => {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(killTarget, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
};
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`RemoteClaw E2E command timed out after ${timeoutValue}`);
  killChild("SIGTERM");
  setTimeout(() => killChild("SIGKILL"), killGraceMs).unref();
}, timeoutMs);
const forwardSignal = (signal) => {
  if (parentSignal) {
    killChild("SIGKILL");
    process.exit(signalExitCodes.get(signal) ?? 1);
  }
  parentSignal = signal;
  clearTimeout(timer);
  killChild(signal);
  parentSignalTimer = setTimeout(() => {
    killChild("SIGKILL");
    process.exit(signalExitCodes.get(signal) ?? 1);
  }, killGraceMs);
  parentSignalTimer.unref();
};
process.once("SIGINT", forwardSignal);
process.once("SIGTERM", forwardSignal);
process.once("SIGHUP", forwardSignal);
child.on("close", (code, signal) => {
  clearTimeout(timer);
  if (parentSignalTimer) {
    clearTimeout(parentSignalTimer);
  }
  if (timedOut) {
    process.exit(124);
  }
  if (parentSignal) {
    process.exit(signalExitCodes.get(parentSignal) ?? 1);
  }
  if (code !== null) {
    process.exit(code);
  }
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(1);
});
child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(127);
});
NODE
      return
    fi
    echo "timeout command not found and Node is unavailable; cannot bound RemoteClaw E2E command after $timeout_value" >&2
    return 127
  fi
  if "$timeout_bin" --kill-after=1s 1s true >/dev/null 2>&1; then
    "$timeout_bin" --kill-after=30s "$timeout_value" "$@"
  else
    "$timeout_bin" "$timeout_value" "$@"
  fi
}
remoteclaw_e2e_print_log() {
  local path="$1"
  local max_bytes max_lines
  max_bytes="$(remoteclaw_e2e_read_nonnegative_int_env REMOTECLAW_E2E_LOG_TAIL_BYTES 262144)" || return $?
  max_lines="$(remoteclaw_e2e_read_nonnegative_int_env REMOTECLAW_E2E_LOG_TAIL_LINES 120)" || return $?
  [ -f "$path" ] || return 0
  echo "--- $path ---"
  tail -c "$max_bytes" "$path" 2>/dev/null | tail -n "$max_lines" || tail -n "$max_lines" "$path" || true
}
remoteclaw_e2e_install_package() {
  local log_file="$1"
  local label="${2:-mounted RemoteClaw package}"
  local prefix="${3:-}"
  local package_tgz="${REMOTECLAW_CURRENT_PACKAGE_TGZ:?missing REMOTECLAW_CURRENT_PACKAGE_TGZ}"
  local timeout_value="${REMOTECLAW_E2E_NPM_INSTALL_TIMEOUT:-600s}"
  local args=(-g)
  if [ -n "$prefix" ]; then
    args+=("--prefix" "$prefix")
  fi
  echo "Installing $label..."
  local had_errexit=0
  case "$-" in
    *e*) had_errexit=1 ;;
  esac
  set +e
  remoteclaw_e2e_maybe_timeout "$timeout_value" npm install "${args[@]}" "$package_tgz" --no-fund --no-audit >"$log_file" 2>&1
  local install_status=$?
  if [ "$had_errexit" -eq 1 ]; then
    set -e
  else
    set +e
  fi
  if [ "$install_status" -ne 0 ]; then
    if [ "$install_status" -eq 124 ] || [ "$install_status" -eq 137 ]; then
      echo "npm install timed out after $timeout_value for $label" >&2
    fi
    echo "npm install failed for $label" >&2
    if [ -f "$log_file" ]; then
      remoteclaw_e2e_print_log "$log_file" >&2
    fi
    exit 1
  fi
}
remoteclaw_e2e_assert_package_extensions() {
  local root="$1"
  shift
  local extension
  for extension in "$@"; do
    [ -d "$root/dist/extensions/$extension" ] || {
      echo "Missing packaged extension: $extension" >&2
      exit 1
    }
  done
}
remoteclaw_e2e_find_dep_package() {
  local dep_path="$1"
  shift
  find "$@" -path "*/node_modules/$dep_path/package.json" -print -quit 2>/dev/null || true
}
remoteclaw_e2e_assert_dep_absent() {
  local dep_path="$1"
  shift
  if [ -n "$(remoteclaw_e2e_find_dep_package "$dep_path" "$@")" ]; then
    echo "$dep_path should not be installed" >&2
    find "$@" -path "*/node_modules/$dep_path/package.json" -print 2>/dev/null >&2 || true
    exit 1
  fi
}
remoteclaw_e2e_assert_dep_present() {
  local dep_path="$1"
  shift
  if [ -n "$(remoteclaw_e2e_find_dep_package "$dep_path" "$@")" ]; then
    return 0
  fi
  echo "$dep_path was not installed on demand" >&2
  find "$@" -maxdepth 6 -type d -name node_modules -print 2>/dev/null >&2 || true
  exit 1
}
remoteclaw_e2e_write_state_env() {
  local target="${1:-/tmp/remoteclaw-test-state-env}"
  {
    printf 'export HOME=%q\n' "$HOME"
    printf 'export REMOTECLAW_HOME=%q\n' "$REMOTECLAW_HOME"
    printf 'export REMOTECLAW_STATE_DIR=%q\n' "$REMOTECLAW_STATE_DIR"
    printf 'export REMOTECLAW_CONFIG_PATH=%q\n' "$REMOTECLAW_CONFIG_PATH"
    printf 'export REMOTECLAW_AGENT_DIR=%q\n' "${REMOTECLAW_AGENT_DIR-}"
  } >"$target"
}
remoteclaw_e2e_install_trash_shim() {
  local shim_dir="${REMOTECLAW_E2E_BIN_DIR:-}"
  if [ -z "$shim_dir" ]; then
    if [ -n "${REMOTECLAW_STATE_DIR:-}" ]; then
      shim_dir="$REMOTECLAW_STATE_DIR/e2e-bin"
    else
      shim_dir="$(mktemp -d "${TMPDIR:-/tmp}/remoteclaw-bin.XXXXXX")"
    fi
    REMOTECLAW_E2E_BIN_DIR="$shim_dir"
    export REMOTECLAW_E2E_BIN_DIR
  fi
  case ":$PATH:" in
    *":$shim_dir:"*) ;;
    *) export PATH="$shim_dir:$PATH" ;;
  esac
  mkdir -p "$shim_dir"
  cat >"$shim_dir/trash" <<'TRASH'
#!/usr/bin/env bash
set -euo pipefail
trash_dir="$HOME/.Trash"
mkdir -p "$trash_dir"
for target in "$@"; do
  [ -e "$target" ] || continue
  base="$(basename "$target")"
  dest="$trash_dir/$base"
  [ -e "$dest" ] && dest="$trash_dir/${base}-$(date +%s)-$$"
  mv "$target" "$dest"
done
TRASH
  chmod +x "$shim_dir/trash"
}
remoteclaw_e2e_run_script_with_pty() {
  local command="$1"
  local log_path="$2"
  local timeout_value="${REMOTECLAW_E2E_COMMAND_TIMEOUT:-300s}"
  if script --version >/dev/null 2>&1; then
    remoteclaw_e2e_maybe_timeout "$timeout_value" script -q -f -c "$command" "$log_path"
  elif node -e 'import("@lydell/node-pty")' >/dev/null 2>&1; then
    remoteclaw_e2e_maybe_timeout "$timeout_value" node scripts/e2e/lib/run-with-pty.mjs "$log_path" /bin/bash -lc "$command"
  else
    remoteclaw_e2e_maybe_timeout "$timeout_value" script -q -F "$log_path" /bin/bash -lc "$command"
  fi
}
remoteclaw_e2e_start_tracked_process() {
  local log_path="${1:?missing RemoteClaw E2E process log path}"
  shift
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >"$log_path" 2>&1 &
    printf '%s\n' "$!"
    return
  fi
  node --input-type=module - "$log_path" "$@" <<'NODE'
import { closeSync, openSync } from "node:fs";
import { spawn } from "node:child_process";

const [logPath, command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("missing command for RemoteClaw E2E tracked process");
  process.exit(1);
}
const logFd = openSync(logPath, "a");
const child = spawn(command, args, {
  detached: process.platform !== "win32",
  env: process.env,
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);
child.unref();
console.log(child.pid);
NODE
}
remoteclaw_e2e_signal_process() {
  local pid="${1:-}" signal="${2:-TERM}"
  [ -n "$pid" ] || return 0
  if kill -0 -- "-$pid" >/dev/null 2>&1; then
    kill "-$signal" -- "-$pid" >/dev/null 2>&1 || true
    return 0
  fi
  kill "-$signal" "$pid" >/dev/null 2>&1 || true
}
remoteclaw_e2e_process_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" >/dev/null 2>&1 || kill -0 -- "-$pid" >/dev/null 2>&1
}
remoteclaw_e2e_stop_process() {
  local pid="${1:-}" _
  [ -n "$pid" ] || return 0
  remoteclaw_e2e_signal_process "$pid" TERM
  for _ in $(seq 1 40); do
    ! remoteclaw_e2e_process_alive "$pid" && { wait "$pid" >/dev/null 2>&1 || true; return 0; }
    sleep 0.25
  done
  remoteclaw_e2e_signal_process "$pid" KILL
  wait "$pid" >/dev/null 2>&1 || true
}
remoteclaw_e2e_terminate_gateways() {
  remoteclaw_e2e_stop_process "${1:-}"
}
remoteclaw_e2e_start_mock_openai() { remoteclaw_e2e_start_tracked_process "$2" env "MOCK_PORT=$1" node scripts/e2e/mock-openai-server.mjs; }
remoteclaw_e2e_wait_mock_openai() {
  local port="$1" attempts="${2:-80}" timeout_ms="${3:-400}" _
  for _ in $(seq 1 "$attempts"); do
    remoteclaw_e2e_probe_http "http://127.0.0.1:${port}/health" ok "$timeout_ms" && return 0
    sleep 0.1
  done
  remoteclaw_e2e_probe_http "http://127.0.0.1:${port}/health" ok "$timeout_ms"
}
remoteclaw_e2e_start_gateway() { remoteclaw_e2e_start_tracked_process "$3" node "$1" gateway --port "$2" --bind loopback --allow-unconfigured; }
remoteclaw_e2e_exec_gateway() { exec node "$1" gateway --port "$2" --bind "${3:-loopback}" --allow-unconfigured >"$4" 2>&1; }
remoteclaw_e2e_gateway_log_port_from_text() {
  sed -nE 's/.*(127\.0\.0\.1|localhost):([0-9]+).*/\2/p' | tail -n 1
}
remoteclaw_e2e_gateway_log_port() {
  grep '\[gateway\] ready' "$1" 2>/dev/null | remoteclaw_e2e_gateway_log_port_from_text
}
remoteclaw_e2e_wait_gateway_ready() {
  local pid="$1" log="$2" attempts="${3:-300}" ready_port="${4:-}" readiness_mode="${5:-strict}" _ saw_ready_log=false
  local ready_scan_offset=0 ready_scan_carry="" ready_scan_carry_chars=256
  for _ in $(seq 1 "$attempts"); do
    ! kill -0 "$pid" >/dev/null 2>&1 && {
      echo "Gateway exited before becoming ready"
      wait "$pid" || true
      tail -n 120 "$log" 2>/dev/null || true
      return 1
    }
    if [ "$saw_ready_log" != "true" ] && [ -f "$log" ]; then
      local log_bytes="0"
      log_bytes="$(wc -c <"$log" 2>/dev/null || echo 0)"
      log_bytes="${log_bytes//[[:space:]]/}"
      if ! [[ "$log_bytes" =~ ^[0-9]+$ ]]; then
        log_bytes="0"
      fi
      if [ "$log_bytes" -lt "$ready_scan_offset" ]; then
        ready_scan_offset=0
        ready_scan_carry=""
      fi
      if [ "$log_bytes" -gt "$ready_scan_offset" ]; then
        local new_log_text scan_text
        new_log_text="$(tail -c +"$((ready_scan_offset + 1))" "$log" 2>/dev/null || true)"
        ready_scan_offset="$log_bytes"
        scan_text="${ready_scan_carry}${new_log_text}"
        if [ "${#scan_text}" -gt "$ready_scan_carry_chars" ]; then
          ready_scan_carry="${scan_text: -$ready_scan_carry_chars}"
        else
          ready_scan_carry="$scan_text"
        fi
        local ready_log_lines
        ready_log_lines="$(printf "%s" "$scan_text" | grep '\[gateway\] ready' || true)"
        if [ -n "$ready_log_lines" ]; then
          saw_ready_log=true
          [ -n "$ready_port" ] || ready_port="$(printf "%s" "$ready_log_lines" | remoteclaw_e2e_gateway_log_port_from_text)"
        fi
      fi
    fi
    if [ "$saw_ready_log" = "true" ]; then
      [ "$readiness_mode" = "legacy-ready-log-ok" ] && return 0
      [ -n "$ready_port" ] || ready_port="${REMOTECLAW_E2E_GATEWAY_READY_PORT:-18789}"
      remoteclaw_e2e_probe_http "http://127.0.0.1:${ready_port}/readyz" ok 400 && return 0
    fi
    sleep 0.25
  done
  if [ "$saw_ready_log" = "true" ]; then
    echo "Gateway log reported ready, but /readyz probe never succeeded"
  else
    echo "Gateway did not become ready"
  fi
  tail -n 120 "$log" 2>/dev/null || true
  return 1
}
remoteclaw_e2e_probe_tcp() {
  node --input-type=module -e '
    import net from "node:net";
    const socket = net.createConnection({ host: process.argv[1], port: Number(process.argv[2]) });
    const timeout = setTimeout(() => { socket.destroy(); process.exit(1); }, Number(process.argv[3] ?? 400));
    socket.on("connect", () => { clearTimeout(timeout); socket.end(); process.exit(0); });
    socket.on("error", () => { clearTimeout(timeout); process.exit(1); });
  ' "$1" "$2" "${3:-400}"
}
remoteclaw_e2e_probe_http() {
  node --input-type=module -e '
    const expected = process.argv[2] ?? "ok";
    const timeoutMs = Number(process.argv[3] ?? 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let exitCode = 1;
    let response;
    try {
      response = await fetch(process.argv[1], { signal: controller.signal });
      const passed = expected === "ok" ? response.ok : response.status === Number(expected);
      exitCode = passed ? 0 : 1;
    } catch {
      exitCode = 1;
    } finally {
      clearTimeout(timer);
      await response?.body?.cancel?.().catch(() => undefined);
    }
    process.exit(exitCode);
  ' "$1" "${2:-ok}" "${3:-400}"
}
remoteclaw_e2e_probe_http_status() {
  remoteclaw_e2e_probe_http "$1" "${2:-200}" "${3:-400}"
}
remoteclaw_e2e_assert_file() { [ -f "$1" ] || { echo "Missing file: $1"; exit 1; }; }
remoteclaw_e2e_assert_dir() { [ -d "$1" ] || { echo "Missing dir: $1"; exit 1; }; }
remoteclaw_e2e_assert_log_not_contains() {
  ! grep -q "$2" "$1" || { echo "Unexpected log output: $2"; exit 1; }
}
remoteclaw_e2e_run_logged() {
  local label="$1" log_root="${REMOTECLAW_E2E_LOG_DIR:-${TMPDIR:-/tmp}}" log_path safe_label
  shift
  safe_label="${label//[^A-Za-z0-9_.-]/-}"
  [ -n "$safe_label" ] || safe_label="command"
  mkdir -p "$log_root"
  log_path="$(mktemp "$log_root/remoteclaw-${safe_label}.XXXXXX.log")"
  REMOTECLAW_E2E_LAST_LOG_PATH="$log_path"
  export REMOTECLAW_E2E_LAST_LOG_PATH
  remoteclaw_e2e_run_command "$@" >"$log_path" 2>&1 || { remoteclaw_e2e_print_log "$log_path"; exit 1; }
}
remoteclaw_e2e_run_command() {
  local timeout_value="${REMOTECLAW_E2E_COMMAND_TIMEOUT:-300s}"
  remoteclaw_e2e_maybe_timeout "$timeout_value" "$@"
}
remoteclaw_e2e_enable_remoteclaw_cli_timeout() {
  REMOTECLAW_E2E_CLI_BIN="$(type -P remoteclaw)"
  if [ -z "$REMOTECLAW_E2E_CLI_BIN" ]; then
    echo "RemoteClaw CLI binary not found on PATH" >&2
    return 1
  fi
  export REMOTECLAW_E2E_CLI_BIN
  remoteclaw() {
    remoteclaw_e2e_run_command "$REMOTECLAW_E2E_CLI_BIN" "$@"
  }
}
remoteclaw_e2e_dump_logs() {
  local path
  for path in "$@"; do
    remoteclaw_e2e_print_log "$path"
  done
}
