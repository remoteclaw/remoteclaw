#!/usr/bin/env bash
set -euo pipefail

attempts="${CLAWHUB_BUN_INSTALL_ATTEMPTS:-3}"
delay_seconds="${CLAWHUB_BUN_INSTALL_RETRY_DELAY_SECONDS:-15}"

for attempt in $(seq 1 "${attempts}"); do
  if bun install --frozen-lockfile; then
    exit 0
  fi

  status="$?"
  if [[ "${attempt}" == "${attempts}" ]]; then
    exit "${status}"
  fi

  echo "::warning::ClawHub CLI bun install failed on attempt ${attempt}/${attempts}; clearing install cache before retry."
  rm -rf node_modules
  rm -rf "${BUN_INSTALL_CACHE_DIR:-${HOME}/.bun/install/cache}"
  find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name 'bun-*' -prune -exec rm -rf {} + 2>/dev/null || true
  sleep "$((delay_seconds * attempt))"
done
