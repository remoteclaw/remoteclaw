#!/usr/bin/env bash
#
# Packaged plugin-boot smoke gate.
#
# Packs the built npm artifact, installs it into an ISOLATED consumer OUTSIDE
# the repo checkout, and boots `remoteclaw plugins doctor`, failing if any
# bundled plugin fails to load from the packaged artifact.
#
# Defends the sync #2762+ regression: the build emitted the plugin-sdk root
# alias (`dist/plugin-sdk/root-alias.cjs`) but not the concrete per-subpath
# `dist/plugin-sdk/<subpath>.js` files it resolves against. In the published
# package that made every bundled extension importing such a subpath (e.g.
# `text-runtime`) fail at load with
# `Cannot find module '.../dist/plugin-sdk/root-alias.cjs/<subpath>'`, so the
# gateway booted with ZERO plugins. `pnpm build` + `pnpm release:check` did not
# catch it because neither exercises the installed package's runtime plugin
# loader.
#
# Two non-obvious properties this gate depends on:
#
#   * ISOLATION (out-of-repo consumer). Node resolves the bare `remoteclaw`
#     specifier — and the plugin-sdk root-alias subpaths the bundled extensions
#     import — from the nearest `node_modules`, climbing parent directories. A
#     consumer nested inside the repo climbs into the repo's own freshly-built
#     dist and masks a broken PACKAGED artifact. The regression only reproduces
#     when the tarball is the sole resolution source, so the consumer MUST live
#     outside the repo tree.
#
#   * GREP, not exit code. `plugins doctor` exits 0 even when plugins fail to
#     load; the failure is only visible in its printed report.
#
# Requires `pnpm build` to have run first (mirrors the `build` job, which runs
# `pnpm build` then `pnpm release:check`).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f dist/plugin-sdk/root-alias.cjs ]]; then
  echo "::error::dist not built (dist/plugin-sdk/root-alias.cjs missing). Run 'pnpm build' before this gate." >&2
  exit 1
fi

PACK_DIR="$(mktemp -d)"
CONSUMER="$(mktemp -d)"
cleanup() { rm -rf "$PACK_DIR" "$CONSUMER"; }
trap cleanup EXIT

# The consumer must live OUTSIDE the repo tree, or module resolution leaks into
# the repo's built dist and the gate stops discriminating a broken tarball.
case "$CONSUMER/" in
  "$REPO_ROOT"/*)
    echo "::error::isolated consumer $CONSUMER is inside the repo checkout — isolation broken" >&2
    exit 1
    ;;
esac

# Pack the freshly-built dist. --ignore-scripts skips the prepack rebuild: the
# build step already produced dist, and prepack's `pnpm build` is identical.
TARBALL_NAME="$(npm pack --ignore-scripts --pack-destination "$PACK_DIR" 2>/dev/null | tail -1)"
TARBALL="$PACK_DIR/$TARBALL_NAME"
echo "Packed: $TARBALL"

cd "$CONSUMER"
npm init -y >/dev/null 2>&1
echo "Installing packaged tarball into isolated consumer: $CONSUMER"
if ! npm install "$TARBALL" --ignore-scripts --no-audit --no-fund >install.log 2>&1; then
  echo "::error::tarball install failed" >&2
  cat install.log >&2
  exit 1
fi

PKG="node_modules/remoteclaw"

# Explicit regression tripwire: the concrete subpath file that was missing in
# #2762 must be present in the INSTALLED package.
if [[ ! -f "$PKG/dist/plugin-sdk/text-runtime.js" ]]; then
  echo "::error::packaged artifact is missing dist/plugin-sdk/text-runtime.js (the #2762 regression)" >&2
  exit 1
fi

# Degenerate-pass guard: a clean doctor report is only meaningful if the artifact
# actually ships plugins for it to load. Zero bundled extensions would make the
# smoke test vacuous.
EXT_COUNT="$(find "$PKG/extensions" -maxdepth 2 -name remoteclaw.plugin.json 2>/dev/null | wc -l | tr -d ' ' || true)"
if [[ "${EXT_COUNT:-0}" -eq 0 ]]; then
  echo "::error::no bundled extensions found in packaged artifact — smoke test would be vacuous" >&2
  exit 1
fi
echo "Bundled extensions present in packaged artifact: $EXT_COUNT"

mkdir -p home
echo "Booting 'remoteclaw plugins doctor' (non-interactive)…"
set +e
DOCTOR_OUT="$(REMOTECLAW_HOME="$PWD/home" NODE_ENV=production \
  node "$PKG/remoteclaw.mjs" plugins doctor </dev/null 2>&1)"
DOCTOR_RC=$?
set -e
echo "----- plugins doctor output -----"
echo "$DOCTOR_OUT"
echo "---------------------------------"

# A non-zero exit is a boot crash (distinct from a plugin load failure, which
# doctor reports while still exiting 0).
if [[ $DOCTOR_RC -ne 0 ]]; then
  echo "::error::'remoteclaw plugins doctor' exited $DOCTOR_RC (boot crash)" >&2
  exit 1
fi

# doctor exits 0 even on plugin load failures — detect them in the report text.
if printf '%s\n' "$DOCTOR_OUT" | grep -qiE 'failed to load plugin|^Plugin errors:'; then
  echo "::error::one or more plugins failed to load from the packaged artifact" >&2
  exit 1
fi

# Positive confirmation the health path actually ran and evaluated cleanly.
if ! printf '%s\n' "$DOCTOR_OUT" | grep -q 'No plugin issues detected.'; then
  echo "::error::unexpected 'plugins doctor' output — missing clean-health confirmation" >&2
  exit 1
fi

echo "Packaged plugin-boot smoke test passed: all bundled plugins loaded cleanly."
