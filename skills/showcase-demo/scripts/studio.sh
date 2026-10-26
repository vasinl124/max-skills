#!/usr/bin/env bash
# studio.sh <dir> — make <dir> the Remotion project for one showcase, from this skill's template.
# Remotion (and the headless Chrome it downloads on its first render) is installed once, in a shared
# cache, and linked in, so every showcase after the first starts in seconds. An existing <dir>/src
# is kept as it is, edits and all; delete it to start again from the template.
#
#   bash studio.sh "${TMPDIR:-/tmp}/showcase/<product>"
#
# Prints <dir>. Override the cache with SHOWCASE_CACHE=/path.
set -euo pipefail

dir="${1:?usage: studio.sh <dir>}"
skill="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache="${SHOWCASE_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/showcase-demo}"

mkdir -p "$cache" "$dir/public/takes"
if [ ! -d "$cache/node_modules" ] || ! cmp -s "$skill/template/package.json" "$cache/package.json"; then
  cp "$skill/template/package.json" "$cache/package.json"
  (cd "$cache" && npm install --no-audit --no-fund --loglevel=error) >&2
fi
if [ ! -d "$dir/src" ]; then
  cp -R "$skill/template/src" "$dir/"
  cp "$skill/template/package.json" "$skill/template/remotion.config.ts" "$skill/template/tsconfig.json" "$dir/"
fi
ln -sfn "$cache/node_modules" "$dir/node_modules"
echo "$dir"
