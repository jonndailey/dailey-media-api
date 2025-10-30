#!/usr/bin/env bash
set -euo pipefail

# Requires GitHub CLI (gh) authenticated for this repo.
# Usage: ./scripts/create-issues.sh [--dry-run]

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

function create_issue() {
  local title="$1"; shift
  local body="$1"; shift
  local labels="$1"; shift
  if $DRY_RUN; then
    echo "[dry-run] gh issue create --title \"$title\" --label $labels --body <<'EOF'\n$body\nEOF"
  else
    gh issue create --title "$title" --label $labels --body "$body"
  fi
}

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKLOG_FILE="$ROOT_DIR/docs/BACKLOG.md"

if [[ ! -f "$BACKLOG_FILE" ]]; then
  echo "Backlog file not found: $BACKLOG_FILE" >&2
  exit 1
fi

# Minimal parser: scan headings and assemble issue titles + stub bodies
current_section=""
while IFS= read -r line; do
  if [[ "$line" =~ ^##\  ]]; then
    current_section="${line#\#\# }"
  elif [[ "$line" =~ ^[0-9]+\)\ feat ]]; then
    title_part="${line#*) }"
    title="${title_part}"
    body="Automated backlog import from docs/BACKLOG.md\n\nSection: $current_section\n\nPlease refer to BACKLOG for acceptance criteria and API sketch."
    labels="enhancement,api"
    create_issue "$title" "$body" "$labels"
  fi
done < "$BACKLOG_FILE"

echo "Done."

