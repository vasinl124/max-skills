#!/usr/bin/env bash
# Symlink every skill in this repo into one or more agent skills dirs, so edits here are live.
# Idempotent, and it never overwrites: anything already at a destination that isn't this
# repo's skill is reported and skipped (exit 1).
#
#   ./link.sh ~/.claude/skills ~/.codex/skills
set -euo pipefail

[ "$#" -ge 1 ] || { echo "usage: link.sh <skills-dir> [<skills-dir> ...]   e.g. ./link.sh ~/.claude/skills ~/.codex/skills" >&2; exit 2; }
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skipped=0

for target in "$@"; do
  mkdir -p "$target"
  for src in "$REPO"/skills/*/; do
    src="${src%/}"
    [ -f "$src/SKILL.md" ] || continue
    dest="$target/$(basename "$src")"
    if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
      ln -s "$src" "$dest"
      echo "linked  $dest"
    elif [ "$(cd "$dest" 2>/dev/null && pwd -P)" = "$src" ]; then
      echo "ok      $dest"
    else
      echo "SKIPPED $dest — something else is already there; move it aside and re-run" >&2
      skipped=1
    fi
  done
done
exit "$skipped"
