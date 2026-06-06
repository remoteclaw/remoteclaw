#!/usr/bin/env bash
#
# Rebrand leakage gate — detects unrebranded openclaw references.
#
# Two independent scans run over the same target file set:
#
#   1. Generic        — any case-insensitive `openclaw` substring, filtered by
#                       the broad allowlist (scripts/ci/rebrand-allowlist.txt).
#                       This is the original scan; its behaviour is unchanged.
#
#   2. Reverse-domain — the upstream reverse-domain namespace `ai.openclaw`,
#                       matched case-insensitively with or without a trailing
#                       segment (so both `ai.openclaw.app` and a bare 2-segment
#                       `ai.openclaw` applicationId are caught), in build /
#                       identity manifests: *.gradle.kts, Info.plist, *.pbxproj
#                       (latent — none tracked today; kept as future-proofing),
#                       *.entitlements, AndroidManifest.xml. The fork's identity
#                       is `org.remoteclaw.*`; any `ai.openclaw` here is an
#                       identity regression. This scan uses its OWN narrow
#                       allowlist (scripts/ci/rebrand-reverse-domain-allowlist.txt)
#                       so the broad `apps/` and `openclaw.` exemptions that scan 1
#                       honors cannot mask the regression. See issue #2686 — a
#                       v2026.4.12 sync reverted apps/android/app/build.gradle.kts
#                       to `ai.openclaw.app` and scan 1 stayed GREEN.
#
#   3. Positive-presence — some fork identities are NAMES, not reverse-domains:
#                       apps/macos/Package.swift declares the `remoteclaw-mac`
#                       executable and the `RemoteClawMacCLI` target. A wholesale
#                       revert to upstream's binary names is invisible to scan 1
#                       (apps/ is broadly allowlisted) and scan 2 (Package.swift
#                       is not a reverse-domain manifest), so assert PRESENCE of
#                       the fork name directly. Unlike scans 1 & 2, this scan runs
#                       UNCONDITIONALLY (independent of the changed-file set) so a
#                       latent reversion already on the base branch is caught too;
#                       a missing anchor file is tolerated. See issue #2697.
#
# Modes:
#   --staged   Pre-commit: checks staged files only
#   --all      Full scan: checks entire repo
#   (default)  CI: checks files changed vs origin/main
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$SCRIPT_DIR/rebrand-allowlist.txt"
REVERSE_DOMAIN_ALLOWLIST="$SCRIPT_DIR/rebrand-reverse-domain-allowlist.txt"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

cd "$ROOT"

MODE="ci"
case "${1:-}" in
  --staged) MODE="staged" ;;
  --all)    MODE="all" ;;
  --help|-h)
    echo "Usage: $(basename "$0") [--staged | --all]"
    echo "  --staged  Check staged files only (pre-commit)"
    echo "  --all     Full repo scan"
    echo "  (default) CI: files changed vs origin/main"
    exit 0
    ;;
esac

# --- Collect target files (NUL-delimited to stdout) -------------------------

list_files() {
  case "$MODE" in
    staged) git diff --cached --name-only --diff-filter=ACMR -z ;;
    all)    git ls-files -z ;;
    ci)     git diff --name-only --diff-filter=ACMR -z "origin/main...HEAD" 2>/dev/null \
              || git diff --name-only --diff-filter=ACMR -z "main...HEAD" ;;
  esac
}

CLEANUP_DIR=$(mktemp -d)
trap 'rm -rf "$CLEANUP_DIR"' EXIT

# --- Allowlist loading -------------------------------------------------------
#
# load_allowlist <allowlist-file> <out-files> <out-dirs> <out-patterns>
#   FILE:path   — exempt a single file (exact match, relative to repo root)
#   FILE:dir/   — exempt an entire directory (trailing slash = prefix match)
#   pattern     — exempt any matched line containing this substring (case-sensitive)
load_allowlist() {
  local allowlist="$1" out_files="$2" out_dirs="$3" out_patterns="$4"
  : > "$out_files"
  : > "$out_dirs"
  : > "$out_patterns"
  [[ -f "$allowlist" ]] || return 0
  local line path
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^FILE: ]]; then
      path="${line#FILE:}"
      if [[ "$path" == */ ]]; then
        echo "$path" >> "$out_dirs"
      else
        echo "$path" >> "$out_files"
      fi
    else
      echo "$line" >> "$out_patterns"
    fi
  done < "$allowlist"
}

# --- Violation filtering (awk) ----------------------------------------------
#
# Reads `file:line:content` lines on stdin; drops any whose file is exempt
# (exact match or directory prefix) or whose content contains an exempt
# substring pattern. Exempt lists are passed via the EXEMPT_FILES /
# EXEMPT_DIRS / EXEMPT_PATTERNS environment variables.
AWK_FILTER='
  BEGIN {
    while ((getline f < ENVIRON["EXEMPT_FILES"]) > 0) files[f] = 1
    while ((getline d < ENVIRON["EXEMPT_DIRS"]) > 0) dirs[++nd] = d
    while ((getline p < ENVIRON["EXEMPT_PATTERNS"]) > 0) pats[++np] = p
  }
  {
    match($0, /^[^:]+/)
    file = substr($0, RSTART, RLENGTH)
    if (file in files) next
    for (i = 1; i <= nd; i++)
      if (index(file, dirs[i]) == 1) next
    for (i = 1; i <= np; i++)
      if (index($0, pats[i]) > 0) next
    print
  }
'

# --- One scan pass -----------------------------------------------------------
#
# scan <pattern> <file-list-bin> <exempt-files> <exempt-dirs> <exempt-patterns>
#   Greps the NUL-delimited file list for a case-insensitive fixed-string
#   pattern, then drops allowlisted hits. Echoes the surviving violations.
#   Always returns 0 (success) so it is safe under `set -e` in $(...).
scan() {
  local pattern="$1" file_list="$2"
  [[ -s "$file_list" ]] || return 0
  export EXEMPT_FILES="$3" EXEMPT_DIRS="$4" EXEMPT_PATTERNS="$5"
  xargs -0 grep -inIHF "$pattern" -- < "$file_list" 2>/dev/null \
    | awk "$AWK_FILTER" \
    || true
}

# --- Collect target files ----------------------------------------------------

FILE_LIST="$CLEANUP_DIR/file-list.bin"
list_files > "$FILE_LIST"

if [[ ! -s "$FILE_LIST" ]]; then
  # No changed/listed files for the diff-scoped leakage scans (1 & 2) — but the
  # positive-presence anchor scan (3) below runs UNCONDITIONALLY, so do not exit
  # here. Scans 1 & 2 no-op safely on an empty file list.
  echo "No changed files to scan for leakage."
fi

# --- Scan 1: generic openclaw leakage (broad allowlist) ----------------------

GEN_FILES="$CLEANUP_DIR/gen-files.txt"
GEN_DIRS="$CLEANUP_DIR/gen-dirs.txt"
GEN_PATTERNS="$CLEANUP_DIR/gen-patterns.txt"
load_allowlist "$ALLOWLIST" "$GEN_FILES" "$GEN_DIRS" "$GEN_PATTERNS"
generic_violations=$(scan 'openclaw' "$FILE_LIST" "$GEN_FILES" "$GEN_DIRS" "$GEN_PATTERNS")

# --- Scan 2: reverse-domain ai.openclaw* in build/identity manifests ---------
#
# Filter the target set down to identity manifests, then scan with a SEPARATE
# narrow allowlist so scan 1's broad exemptions cannot mask the regression.
# Pattern is the bare namespace `ai.openclaw` (fixed-string, case-insensitive)
# so a 2-segment `ai.openclaw` id is caught as well as `ai.openclaw.<segment>`.

MANIFEST_LIST="$CLEANUP_DIR/manifest-list.bin"
while IFS= read -r -d '' f; do
  case "$f" in
    *.gradle.kts | *.pbxproj | *.entitlements | *Info.plist | *AndroidManifest.xml)
      printf '%s\0' "$f" ;;
  esac
done < "$FILE_LIST" > "$MANIFEST_LIST"

REV_FILES="$CLEANUP_DIR/rev-files.txt"
REV_DIRS="$CLEANUP_DIR/rev-dirs.txt"
REV_PATTERNS="$CLEANUP_DIR/rev-patterns.txt"
load_allowlist "$REVERSE_DOMAIN_ALLOWLIST" "$REV_FILES" "$REV_DIRS" "$REV_PATTERNS"
reverse_domain_violations=$(scan 'ai.openclaw' "$MANIFEST_LIST" "$REV_FILES" "$REV_DIRS" "$REV_PATTERNS")

# --- Scan 3: positive-presence fork-identity anchors -------------------------
#
# Assert that fork identities expressed as NAMES (not reverse-domains) are still
# present in the manifest that must carry them. Each anchor is "<file>|<required>"
# — the file is read on disk at HEAD, independent of the changed-file set, so a
# latent reversion already on the base branch is caught too. A MISSING anchor
# file is tolerated (the macOS app may be legitimately gutted — RemoteClaw is
# CLI-only middleware); only a present-but-reverted file is a violation. To
# extend coverage (e.g. an org.remoteclaw.* Info.plist identity), add a row.

ANCHORS=(
  "apps/macos/Package.swift|remoteclaw-mac"
  "apps/macos/Package.swift|RemoteClawMacCLI"
)

anchor_violations=""
for entry in "${ANCHORS[@]}"; do
  anchor_file="${entry%%|*}"
  anchor_required="${entry#*|}"
  [[ -f "$anchor_file" ]] || continue
  if ! grep -qF -- "$anchor_required" "$anchor_file"; then
    anchor_violations+="$anchor_file: missing required fork identity '$anchor_required'"$'\n'
  fi
done
anchor_violations="${anchor_violations%$'\n'}"

# --- Report ------------------------------------------------------------------

status=0

if [[ -n "$generic_violations" ]]; then
  count=$(printf '%s\n' "$generic_violations" | wc -l | tr -d ' ')
  echo "Rebrand leakage detected ($count violation(s)):"
  echo ""
  printf '%s\n' "$generic_violations" | sed 's/^/  /'
  echo ""
  echo "Fix: replace openclaw with remoteclaw, or add exemption to"
  echo "     scripts/ci/rebrand-allowlist.txt"
  status=1
fi

if [[ -n "$reverse_domain_violations" ]]; then
  [[ $status -ne 0 ]] && echo ""
  count=$(printf '%s\n' "$reverse_domain_violations" | wc -l | tr -d ' ')
  echo "Reverse-domain identity leakage detected ($count violation(s)):"
  echo ""
  printf '%s\n' "$reverse_domain_violations" | sed 's/^/  /'
  echo ""
  echo "The fork's reverse-domain identity is org.remoteclaw.* — an ai.openclaw"
  echo "reverse-domain occurrence in a build/identity manifest is a regression (see #2686)."
  echo "Fix: replace ai.openclaw* with org.remoteclaw.*, or — only for a verified"
  echo "     migration-compat case — add an exemption to"
  echo "     scripts/ci/rebrand-reverse-domain-allowlist.txt"
  status=1
fi

if [[ -n "$anchor_violations" ]]; then
  [[ $status -ne 0 ]] && echo ""
  count=$(printf '%s\n' "$anchor_violations" | wc -l | tr -d ' ')
  echo "Fork-identity anchor missing ($count violation(s)):"
  echo ""
  printf '%s\n' "$anchor_violations" | sed 's/^/  /'
  echo ""
  echo "A required fork-identity NAME is absent from a manifest that must carry it"
  echo "(e.g. the remoteclaw-mac executable / RemoteClawMacCLI target in"
  echo "apps/macos/Package.swift). This is the binary-name analogue of a reverse-domain"
  echo "identity reversion — invisible to scan 1 (apps/ is allowlisted) and scan 2"
  echo "(Package.swift is not a reverse-domain manifest). See #2697."
  echo "Fix: restore the fork-identity name; or — only if the subsystem was"
  echo "     intentionally removed — drop the stale anchor from"
  echo "     scripts/ci/check-rebrand-leakage.sh."
  status=1
fi

if [[ $status -eq 0 ]]; then
  echo "No rebrand leakage detected."
fi

exit $status
