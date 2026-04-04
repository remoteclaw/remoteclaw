#!/usr/bin/env bash
#
# Rebrand leakage gate — detects unrebranded openclaw references.
#
# Modes:
#   --staged   Pre-commit: checks staged files only
#   --all      Full scan: checks entire repo
#   (default)  CI: checks files changed vs origin/main
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$SCRIPT_DIR/rebrand-allowlist.txt"
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

# --- Load allowlist into temp files ------------------------------------------

CLEANUP_DIR=$(mktemp -d)
trap 'rm -rf "$CLEANUP_DIR"' EXIT

EXEMPT_FILES="$CLEANUP_DIR/files.txt"
EXEMPT_DIRS="$CLEANUP_DIR/dirs.txt"
EXEMPT_PATTERNS="$CLEANUP_DIR/patterns.txt"
: > "$EXEMPT_FILES"
: > "$EXEMPT_DIRS"
: > "$EXEMPT_PATTERNS"

if [[ -f "$ALLOWLIST" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^FILE: ]]; then
      path="${line#FILE:}"
      if [[ "$path" == */ ]]; then
        echo "$path" >> "$EXEMPT_DIRS"
      else
        echo "$path" >> "$EXEMPT_FILES"
      fi
    else
      echo "$line" >> "$EXEMPT_PATTERNS"
    fi
  done < "$ALLOWLIST"
fi

# --- Scan --------------------------------------------------------------------

FILE_LIST="$CLEANUP_DIR/file-list.bin"
list_files > "$FILE_LIST"

if [[ ! -s "$FILE_LIST" ]]; then
  echo "No files to check."
  exit 0
fi

export EXEMPT_FILES EXEMPT_DIRS EXEMPT_PATTERNS

violations=$(
  xargs -0 grep -inIH 'openclaw' -- < "$FILE_LIST" 2>/dev/null \
    | awk '
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
      ' \
    || true
)

if [[ -z "$violations" ]]; then
  echo "No rebrand leakage detected."
  exit 0
fi

count=$(printf '%s\n' "$violations" | wc -l | tr -d ' ')
echo "Rebrand leakage detected ($count violation(s)):"
echo ""
printf '%s\n' "$violations" | sed 's/^/  /'
echo ""
echo "Fix: replace openclaw with remoteclaw, or add exemption to"
echo "     scripts/ci/rebrand-allowlist.txt"
exit 1
