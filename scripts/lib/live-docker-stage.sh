#!/usr/bin/env bash

remoteclaw_live_stage_source_tree() {
  local dest_dir="${1:?destination directory required}"
  local stage_mode="${REMOTECLAW_LIVE_DOCKER_SOURCE_STAGE_MODE:-copy}"

  if [ "$stage_mode" = "symlink" ]; then
    echo "REMOTECLAW_LIVE_DOCKER_SOURCE_STAGE_MODE=symlink is disabled; using copy staging." >&2
  fi

  set +e
  tar -C /src \
    --warning=no-file-changed \
    --ignore-failed-read \
    --exclude=.git \
    --exclude=.artifacts \
    --exclude=node_modules \
    --exclude=dist \
    --exclude=ui/dist \
    --exclude=ui/node_modules \
    --exclude=.pnpm-store \
    --exclude=.tmp \
    --exclude=.tmp-precommit-venv \
    --exclude=.worktrees \
    --exclude=__remoteclaw_vitest__ \
    --exclude=relay.sock \
    --exclude='*.sock' \
    --exclude='*/*.sock' \
    --exclude='apps/*/.build' \
    --exclude='apps/*/*.bun-build' \
    --exclude='apps/*/.gradle' \
    --exclude='apps/*/.kotlin' \
    --exclude='apps/*/build' \
    -cf - . | tar -C "$dest_dir" -xf -
  local status=$?
  set -e
  if [ "$status" -gt 1 ]; then
    return "$status"
  fi
}

remoteclaw_live_link_runtime_tree() {
  local dest_dir="${1:?destination directory required}"

  if [ ! -e "$dest_dir/node_modules" ]; then
    ln -s /app/node_modules "$dest_dir/node_modules"
  fi
  ln -s /app/dist "$dest_dir/dist"
  if [ -d /app/dist-runtime/extensions ]; then
    export REMOTECLAW_BUNDLED_PLUGINS_DIR=/app/dist-runtime/extensions
  elif [ -d /app/dist/extensions ]; then
    export REMOTECLAW_BUNDLED_PLUGINS_DIR=/app/dist/extensions
  fi
}

remoteclaw_live_stage_node_modules() {
  local dest_dir="${1:?destination directory required}"
  local target_dir="$dest_dir/node_modules"

  mkdir -p "$target_dir"
  cp -aRs /app/node_modules/. "$target_dir"
  rm -rf "$target_dir/.vite-temp"
  mkdir -p "$target_dir/.vite-temp"
}

remoteclaw_live_scrub_staged_plugin_index() {
  local dest_dir="${1:?destination directory required}"
  local db_path="$dest_dir/state/remoteclaw.sqlite"

  if [ ! -f "$db_path" ]; then
    return 0
  fi

  node - "$db_path" <<'NODE'
const dbPath = process.argv[2];
let db;
try {
  const { DatabaseSync } = await import("node:sqlite");
  db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA secure_delete = ON;");
    db.prepare("DELETE FROM installed_plugin_index WHERE index_key = ?").run("installed-plugin-index");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec("VACUUM;");
  } catch (err) {
    if (!String(err?.message ?? err).includes("no such table")) {
      throw err;
    }
  }
} finally {
  db?.close();
}
NODE
}

remoteclaw_live_stage_state_dir() {
  local dest_dir="${1:?destination directory required}"
  local source_dir="${HOME}/.remoteclaw"

  mkdir -p "$dest_dir"
  if [ -d "$source_dir" ]; then
    # Sandbox workspaces can accumulate root-owned artifacts from prior Docker
    # runs. Persisted plugin registry state contains host-absolute paths that
    # are not portable into Linux containers. Live-test auth/config staging does
    # not need the old JSON source or the SQLite installed_plugin_index row.
    set +e
    tar -C "$source_dir" \
      --warning=no-file-changed \
      --ignore-failed-read \
      --exclude=workspace \
      --exclude=sandboxes \
      --exclude=plugins/installs.json \
      --exclude=plugins/installs.json.migrated \
      --exclude=relay.sock \
      --exclude='*.sock' \
      --exclude='*/*.sock' \
      -cf - . | tar -C "$dest_dir" -xf -
    local status=$?
    set -e
    if [ "$status" -gt 1 ]; then
      return "$status"
    fi
    chmod -R u+rwX "$dest_dir" || true
    remoteclaw_live_scrub_staged_plugin_index "$dest_dir"
    if [ -d "$source_dir/workspace" ] && [ ! -e "$dest_dir/workspace" ]; then
      ln -s "$source_dir/workspace" "$dest_dir/workspace"
    fi
  fi

  export REMOTECLAW_STATE_DIR="$dest_dir"
  export REMOTECLAW_CONFIG_PATH="$dest_dir/remoteclaw.json"
}

remoteclaw_live_prepare_staged_config() {
  if [ ! -f "${REMOTECLAW_CONFIG_PATH:-}" ]; then
    return 0
  fi

  local scripts_dir="${REMOTECLAW_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"
  (
    cd /app
    node --import tsx "$scripts_dir/live-docker-normalize-config.ts"
  )
}
