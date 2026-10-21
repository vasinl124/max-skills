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
  desc="$(sed -n 's/^description: //p' "$d/SKILL.md" | head -1)"
  [ -n "$desc" ] && [ "${#desc}" -le 1024 ] || fail "$d: description missing or over 1024 chars"
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

# 7. coverage.mjs: a changed UI file no scene covers fails the check; a skipped one is named, with why, for the PR
cov=skills/pr-screenshots/scripts/coverage.mjs
echo '[{"name":"a","path":"/","covers":["src/A.tsx"],"after":[{"sel":"h1"}]},{"covers":["src/B.tsx"],"skip":"needs a seeded record"}]' >"$t/scenes.json"
err="$(printf 'src/A.tsx\nsrc/B.tsx\nsrc/C.tsx\nsrc/A.test.tsx\napi/x.ts\n' | node "$cov" --scenes "$t/scenes.json" 2>&1 >/dev/null)" && fail "coverage.mjs passed with src/C.tsx uncovered"
[ "$(grep -c '^  ' <<<"$err")" -eq 1 ] && grep -qx '  src/C.tsx' <<<"$err" || fail "coverage.mjs should flag only src/C.tsx: $err"
out="$(printf 'src/A.tsx\nsrc/B.tsx\napi/x.ts\n' | node "$cov" --scenes "$t/scenes.json" 2>/dev/null)" || fail "coverage.mjs failed with every UI file covered"
grep -qxF -- '- `src/B.tsx`: needs a seeded record' <<<"$out" || fail "coverage.mjs did not name the skipped file: $out"
if : | node "$cov" --scenes "$t/scenes.json" >/dev/null 2>&1; then fail "coverage.mjs passed on an empty file list"; fi
echo '[{"name":"a","path":"/","covers":["src/A.tsx"]}]' >"$t/unboxed.json"
if echo src/A.tsx | node "$cov" --scenes "$t/unboxed.json" >/dev/null 2>&1; then fail "coverage.mjs passed a scene that boxes nothing"; fi

echo "all checks passed"
