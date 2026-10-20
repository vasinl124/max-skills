#!/usr/bin/env bash
# Repo self-check: script syntax, SKILL.md frontmatter, shared-script drift, link.sh behaviour.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. every bundled script parses
while IFS= read -r f; do
  case "$f" in
    *.sh)  bash -n "$f" ;;
    *.mjs) node --check "$f" ;;
    *.py)  python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' "$f" ;;
  esac || fail "syntax: $f"
done < <(find skills link.sh -type f \( -name '*.sh' -o -name '*.mjs' -o -name '*.py' \))

# 2. each skill: frontmatter name matches its directory; description fits the Agent Skills 1024-char limit
for d in skills/*/; do
  d="${d%/}"; name="$(basename "$d")"
  [ -f "$d/SKILL.md" ] || fail "$d has no SKILL.md"
  grep -qx "name: $name" "$d/SKILL.md" || fail "$d: frontmatter name must be '$name'"
  # one-line or folded (description: >-) — measure the text, not the '>-' marker
  len="$(python3 - "$d/SKILL.md" <<'PY'
import re, sys
fm = open(sys.argv[1]).read().split("---")[1]
m = re.search(r"^description:[ \t]*(?:[>|][-+]?[ \t]*\n((?:[ \t]+\S.*\n?)+)|(\S.*))", fm, re.M)
print(len(" ".join(l.strip() for l in m.group(1).splitlines()) if m and m.group(1) else (m.group(2).strip() if m else "")))
PY
)"
  [ "$len" -gt 0 ] && [ "$len" -le 1024 ] || fail "$d: description missing or over 1024 chars ($len)"
done

# 3. scripts shared between skills are duplicated on purpose (each skill installs standalone) — no drift
for f in publish-media.sh alloc-ports.mjs update-pr-body.mjs before-after.mjs; do
  cmp -s "skills/pr-screenshots/scripts/$f" "skills/pr-video/scripts/$f" || fail "$f differs between pr-screenshots and pr-video"
done

# 4. link.sh links, is idempotent, and never overwrites
t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
./link.sh "$t/a" >/dev/null
[ "$(cd "$t/a/pr-video" && pwd -P)" = "$(cd skills/pr-video && pwd -P)" ] || fail "link.sh did not link"
again="$(./link.sh "$t/a")"   # captured, not piped: grep -q + pipefail would SIGPIPE link.sh
grep -q '^ok' <<<"$again" || fail "link.sh is not idempotent"
mkdir -p "$t/b/pr-video"
if ./link.sh "$t/b" >/dev/null 2>&1; then fail "link.sh should exit non-zero when it skips"; fi
[ ! -L "$t/b/pr-video" ] || fail "link.sh overwrote an existing directory"

# 5. skill docs invoke the bundled shell scripts through bash: Codex's skill-installer (and plain copies) drop executable bits
bad=$(grep -hoE '(bash )?"\$(S|SKILL_DIR/scripts/[^"]+\.sh)" ' skills/*/SKILL.md | grep -v '^bash ' || true)
[ -z "$bad" ] || fail "shell script invoked without bash in a SKILL.md — breaks installs that drop exec bits: $bad"

# 6. capture.mjs: routes that slug alike (/foo/bar, /foo-bar, /Foo_bar) each get their own file; the first keeps the plain name
plan="$(node skills/pr-screenshots/scripts/capture.mjs --dry-run --base-url http://x --routes '/foo/bar,/foo-bar,/Foo_bar' --viewports desktop:1440x900 --out "$t/shots")" || fail "capture.mjs --dry-run failed"
files="$(grep -o '"file": "[^"]*"' <<<"$plan" || true)"
[ "$(grep -c . <<<"$files")" -eq 3 ] || fail "capture.mjs --dry-run: expected 3 planned shots: $files"
[ "$(sort -u <<<"$files" | grep -c .)" -eq 3 ] || fail "capture.mjs: colliding route slugs share a file: $files"
grep -q '/foo-bar--desktop.png"$' <<<"$files" || fail "capture.mjs: first route should keep the plain slug: $files"

echo "all checks passed"
