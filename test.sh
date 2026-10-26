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
desc_of() {  # the description value; a block scalar (>- or |) is joined onto one line, as YAML folds it
  awk '/^description:/ { sub(/^description:[[:space:]]*/, ""); if ($0 ~ /^[>|][-+]?$/) $0 = ""; d = $0; on = 1; next }
       on && /^[[:space:]]/ { sub(/^[[:space:]]+/, ""); d = d (d == "" ? "" : " ") $0; next }
       on { exit }
       END { print d }' "$1"
}
for d in skills/*/; do
  d="${d%/}"; name="$(basename "$d")"
  [ -f "$d/SKILL.md" ] || fail "$d has no SKILL.md"
  grep -qx "name: $name" "$d/SKILL.md" || fail "$d: frontmatter name must be '$name'"
  desc="$(desc_of "$d/SKILL.md")"
  [ -n "$desc" ] && [ "${#desc}" -le 1024 ] || fail "$d: description missing or over 1024 chars"
done
# a folded description is measured in full, not as its first line (">-" once passed as 2 chars)
long="$(desc_of <(printf 'description: >-\n  %s\n  %s\n' "$(printf '%0600d' 0)" "$(printf '%0600d' 0)"))"
[ "${#long}" -gt 1024 ] || fail "desc_of measured only the first line of a folded description"

# 3. scripts shared between skills are duplicated on purpose (each skill installs standalone) — no drift
for f in publish-media.sh alloc-ports.mjs update-pr-body.mjs before-after.mjs; do
  cmp -s "skills/pr-screenshots/scripts/$f" "skills/pr-video/scripts/$f" || fail "$f differs between pr-screenshots and pr-video"
done
for f in publish-media.sh alloc-ports.mjs update-pr-body.mjs; do
  cmp -s "skills/pr-video/scripts/$f" "skills/showcase-demo/scripts/$f" || fail "$f differs between pr-video and showcase-demo"
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

# 8. showcase-demo's motion: a zoom frames its target without leaving the stage, glides in and comes home, and the
#    cursor gets out of the way while typing and when idle. Node runs the TypeScript itself from 22.18 (type stripping).
if node -e 'process.exit(process.features.typescript ? 0 : 1)'; then
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module -e '
    import { aim, camera, pointer, IDLE } from "./skills/showcase-demo/template/src/motion.ts";
    const ok = (cond, what) => { if (!cond) throw new Error(what); };
    const L = { W: 1920, H: 1080, ox: 240, oy: 114, k: 1 };
    const corner = { x: 1340, y: 840, w: 100, h: 40 }; // a button in the bottom-right corner
    const a = aim({ box: corner }, L);
    ok(a.s === 1.8 && a.x + L.W / (2 * a.s) <= L.W + 1e-6 && a.y + L.H / (2 * a.s) <= L.H + 1e-6, `zoom leaves the stage: ${JSON.stringify(a)}`);
    const zooms = [{ t: 1, type: "zoom", box: corner }, { t: 4, type: "zoom" }];
    const [mid, held, home] = [1.5, 3, 5.5].map((t) => camera(zooms, t, L));
    ok(mid.s > 1 && mid.s < 1.8 && held.s === 1.8 && home.s === 1 && Math.abs(home.x - L.W / 2) < 1e-6, "camera does not glide in, hold and come home");
    const acts = [{ t: 0, type: "move", from: [0, 0], to: [100, 100], dur: 1 }, { t: 1, type: "click", at: [100, 100] }, { t: 1.2, type: "type", until: 2 }];
    ok(pointer(acts, 1).opacity === 1 && pointer(acts, 1.6).opacity === 0, "cursor stays while typing");
    const still = acts.slice(0, 2);
    ok(pointer(still, 1 + IDLE - 0.1).opacity === 1 && pointer(still, 1 + IDLE + 0.4).opacity === 0, "cursor stays when idle");
  ' || fail "showcase-demo template/src/motion.ts"
else
  echo "skipped: showcase-demo's motion check needs Node 22.18+"
fi

echo "all checks passed"
