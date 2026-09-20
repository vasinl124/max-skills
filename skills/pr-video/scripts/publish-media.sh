#!/usr/bin/env bash
# Publish PR media (png / gif / mp4 / …) to a dedicated media branch via git + gh, and print
# commit-pinned URLs to embed in a PR body — NO browser upload needed.
#
# Convention: a docs/pr-<n>-<slug>-media branch holds ONLY media files, referenced from the PR body
# by commit SHA. On a PUBLIC repo that branch is public too — check media for secrets/PII first.
# Private-repo safe: a
# github.com/<owner>/<repo>/blob/<sha>/<file>?raw=true image embeds inline, and a blob/<sha>/<file>
# video link opens GitHub's file-view player (play/pause/scrub) — both work for anyone with repo access,
# i.e. everyone who can already see the PR. (A fully-embedded autoplaying player IN the PR body is only
# minted by GitHub's drag-drop upload; this flow can't, so pr-video pairs an inline GIF with this link.)
#
# It never touches your working tree, index, or current branch: blobs, a tree and a PARENTLESS
# (orphan) commit are written straight to the object DB via plumbing, using a throwaway index, then
# only that commit is pushed. The push is a force-push, but to a DEDICATED media branch that holds
# nothing else — never the PR/code branch — so re-running the skill just refreshes the media in place.
#
# Usage:
#   publish-media.sh <branch> <file> [file ...]
#     <branch>  e.g. docs/pr-123-settings-redesign-media  (convention: docs/pr-<n>-<slug>-media)
#     <file>    one or more media files (paths anywhere on disk, e.g. your $TMPDIR/pr-media/... output)
#
# Output (stdout), for the caller to build the PR section from:
#   sha=<40-hex>
#   <basename>\t<url>        # blob?raw=true for images/gif (embeds inline); blob/<sha>/ for video (player page)
set -euo pipefail

BRANCH="${1:-}"; shift || true
[ -n "$BRANCH" ] && [ "$#" -ge 1 ] || { echo "usage: publish-media.sh <branch> <file> [file ...]" >&2; exit 2; }
for f in "$@"; do [ -f "$f" ] || { echo "not a file: $f" >&2; exit 2; }; done

SLUG=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Build the orphan commit with a temp index so the real index/worktree are untouched.
IDX=$(mktemp -u)
trap 'rm -f "$IDX"' EXIT
GIT_INDEX_FILE="$IDX"; export GIT_INDEX_FILE
for f in "$@"; do
  blob=$(git hash-object -w -- "$f")                       # store bytes as a blob in this repo's object DB
  git update-index --add --cacheinfo "100644,$blob,$(basename "$f")"
done
TREE=$(git write-tree)
SHA=$(git commit-tree "$TREE" -m "media: $BRANCH")          # no -p ⇒ parentless / orphan
unset GIT_INDEX_FILE

git push -f origin "$SHA:refs/heads/$BRANCH" >&2            # dedicated media branch only

echo "sha=$SHA"
for f in "$@"; do
  b=$(basename "$f")
  case "$b" in
    *.mp4|*.mov|*.webm) printf '%s\t%s\n' "$b" "https://github.com/$SLUG/blob/$SHA/$b" ;;  # file-view player (controls)
    *)                  printf '%s\t%s\n' "$b" "https://github.com/$SLUG/blob/$SHA/$b?raw=true" ;;
  esac
done
