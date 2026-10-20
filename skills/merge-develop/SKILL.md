---
name: merge-develop
description: Merge the latest remote develop branch into the current branch and resolve all merge conflicts autonomously, then verify the result builds and tests pass. Use this whenever the user wants to bring their feature branch up to date with develop or another base branch — including phrases like "merge develop", "merge in the latest develop", "merge remote develop into my branch", "update/sync my branch with develop", "pull develop into my branch", "resolve merge conflicts with develop", "get my branch up to date", or asking to merge main/master/staging into the current branch and fix the conflicts. Also use when a merge is already in progress with conflicts that need resolving.
---

# Merge develop into the current branch

Bring the current branch up to date by merging the latest remote base branch (default: `develop`) into it, resolving every conflict, and verifying the result still builds and tests pass.

## The contract

This skill runs **autonomously**: it resolves every conflict without stopping to ask, completes the merge with a commit, and verifies the result. Because it does not pause for confirmation, the **final report is the user's control surface** — every decision must be accounted for there so the user can audit it and undo if they disagree. Be meticulous about recording what each side wanted and why you resolved it the way you did.

Two hard boundaries on the autonomy:
- **It never pushes.** The merge commit stays local. The user reviews, then pushes.
- **It stops for guard-rail failures** (listed below), which are setup problems, not conflicts. Autonomy is about *conflict resolution*, not about plowing through a broken starting state.

## Inputs

- **Base branch**: `develop` by default. If the user named another branch (`main`, `master`, `staging`) or passed one as an argument, use that instead.
- **Remote**: `origin` by default. If `origin/<base>` does not exist, find the remote that has the base branch (`git branch -r | grep <base>`) before giving up.

## Phase 0 — Guard rails (stop and report, do not proceed)

Check these first. If any fail, stop and tell the user plainly — do not try to work around them:

1. **In a git repo?** `git rev-parse --is-inside-work-tree`. If not, stop.
2. **On a real branch?** `git rev-parse --abbrev-ref HEAD`. If it returns `HEAD` (detached), stop — there is no branch to merge into.
3. **Not already on the base branch?** If the current branch *is* the base (e.g. on `develop`, asked to merge `develop`), stop — that is a `git pull`, not a feature-branch merge. Ask the user what they actually want.
4. **A merge already in progress?** If `.git/MERGE_HEAD` exists, a previous merge is mid-flight. Do not start a new one — skip to Phase 3 and resolve the existing conflicts, then continue from there.

## Phase 1 — Record state and stash if dirty

1. **Capture the pre-merge commit** so the report can give an exact undo target:
   ```bash
   git rev-parse HEAD   # record as START_SHA
   ```
2. **Check for uncommitted work:** `git status --porcelain`. If it prints anything, the tree is dirty.
3. **Auto-stash** a dirty tree (including untracked files) so the merge starts clean:
   ```bash
   git stash push -u -m "merge-develop auto-stash"
   ```
   Note that a stash was created — it must be reapplied in Phase 5, and it changes the undo instructions.

## Phase 2 — Fetch and merge

```bash
git fetch origin <base>
git merge origin/<base>
```

Interpret the outcome:
- **"Already up to date"** → nothing to merge. Reapply the stash (Phase 5) if one was made, then report "already up to date" and stop.
- **Clean merge (exit 0)** → git already created the merge commit. Skip to Phase 5.
- **Conflicts (non-zero exit)** → go to Phase 3.

## Phase 3 — Resolve conflicts (autonomous)

List everything unresolved and understand the *full* set of conflict states, not just "both modified":

```bash
git status                              # shows UU, AA, DU/UD, etc.
git diff --name-only --diff-filter=U    # both-modified files
```

### The mindset that matters most

A merge conflict means **both branches changed the same region with different intent**. Your job is almost never to pick a winner — it is to make **both intents survive together**. Your branch (`ours`, `HEAD`) has the feature work; develop (`theirs`) has changes that landed since you branched. The correct resolution is usually code that does what *both* sets of changes were trying to do.

Blindly taking one side is the most common way to silently destroy work — taking `ours` drops a fix or rename that develop made everywhere else (so the rest of the codebase now expects something your file doesn't provide); taking `theirs` deletes your feature. Only take a side wholesale when you've confirmed one side genuinely supersedes the other.

### To resolve each conflict

1. **See both versions and the common ancestor:**
   ```bash
   git show :1:<file>   # base (common ancestor)
   git show :2:<file>   # ours (HEAD / current branch)
   git show :3:<file>   # theirs (origin/<base>)
   ```
   Or just open the file and read the `<<<<<<<` / `=======` / `>>>>>>>` regions in place.
2. **Understand *why* each side changed** when intent isn't obvious from the diff — this is what separates a correct merge from a plausible-looking broken one:
   ```bash
   git log --oneline -5 HEAD -- <file>            # what our branch did
   git log --oneline -5 origin/<base> -- <file>   # what develop did
   git log --merge -p -- <file>                   # commits implicated in this conflict
   ```
3. **Edit the file** so both intents coexist, and **remove every conflict marker**.
4. **Stage it:** `git add <file>` (or `git rm <file>` for a delete resolution).

Special file types (lockfiles, generated code, migrations, binaries, delete/modify) have mechanical strategies that differ from hand-merging — **read [references/conflict-resolution.md](references/conflict-resolution.md) before resolving them.** Hand-merging a `pnpm-lock.yaml` or a generated file is almost always wrong; those get regenerated instead.

### Before completing

Make sure nothing was missed:
```bash
git diff --name-only --diff-filter=U   # must be empty
git grep -nE '^(<<<<<<<|=======|>>>>>>>)' || echo "no markers left"
```
No unresolved files, no leftover markers anywhere.

## Phase 4 — Complete the merge

```bash
git commit --no-edit   # uses git's prepared merge message
```

## Phase 5 — Reapply the stash (only if Phase 1 stashed)

```bash
git stash pop
```
- **Pops cleanly** → done; the stash is dropped automatically.
- **Conflicts** → `git stash pop` does *not* drop the stash when it conflicts. Resolve these conflicts the same way as Phase 3 (`git add` each), then explicitly `git stash drop` to remove the now-applied entry. Record in the report that the stash reapply conflicted.

## Phase 6 — Verify (full build + test for affected packages)

The point of verification is to catch a resolution that *looks* right but breaks the build — the main risk of autonomous merging. Do not skip it, and **report results honestly**: if something fails, say so with the output. A merge that compiles is not "done" if tests fail.

1. **Find affected packages** — every top-level package/service that the merge touched:
   ```bash
   git diff --name-only <START_SHA> HEAD
   ```
   Map changed paths to their owning package/service. Prioritize packages that contained resolved conflicts (highest risk), but build/test every affected one.
2. **Run each package's real build, typecheck, lint, and tests.** Detect the commands from the package:
   - **Go** (dir has `go.mod`): `go build ./... && go vet ./...` and the repo's lint/test (`make lint`, `make test`, or `go test ./...`).
   - **JS/TS** (dir has `package.json`): run the package's own `build` / `typecheck` / `lint` / `test` scripts via `pnpm --filter <pkg> run <script>`.
   - If a package needs a live environment to test (integration/e2e against real services), don't fake it — run what you safely can and mark the rest as **not run** in the report.
3. **Project shortcuts.** If the repo's `AGENTS.md` / `CLAUDE.md` lists verification commands (format, typecheck, lint, test), run those too. They are what CI expects.

## Phase 7 — Report

This is the deliverable. Use this structure:

```
## Merge report: origin/<base> → <current-branch>

Result: <merged cleanly | resolved N conflicts | already up to date>
Merged commits: <count> (<short SHA range>)

### Conflicts resolved (N)
| File | Resolution | Why |
|------|------------|-----|
| path/to/a.ts   | combined both     | kept our new prop + their renamed handler |
| pnpm-lock.yaml | regenerated       | ran pnpm install against the merged manifests |
| go.sum         | regenerated       | go mod tidy after merging go.mod require blocks |
(omit this section entirely if the merge was clean)

### Stash
<none needed | stashed N files, reapplied cleanly | stashed N files, reapply conflicted — resolved (see above)>

### Verification
- <command> → PASS
- <command> → FAIL
  <relevant failing output>

### Next steps
- Not pushed — review the merge, then `git push` when satisfied.
- Undo this merge: `git reset --hard <START_SHA>`
  <if a stash was reapplied, add:> Your previously-uncommitted work is now in the working tree. To undo the merge while keeping that work: `git stash` it, `git reset --hard <START_SHA>`, then `git stash pop`.
```

Fill the conflict table with **one row per file**, naming the actual resolution (`combined both` / `took ours` / `took theirs` / `regenerated` / `kept both, renumbered`) and a one-line reason. This table is how the user audits autonomous decisions — vague entries like "fixed it" defeat the purpose.

## If you get stuck

If a conflict is genuinely beyond confident resolution (e.g. the two sides made deeply incompatible architectural changes to the same logic and either choice loses real behavior), do not guess and bury it. The panic button restores the exact pre-merge state:
```bash
git merge --abort        # restores pre-merge HEAD (use before the merge commit)
git stash pop            # if a stash was made, restore the working tree
```
Then report the specific conflict, show both sides, and ask the user how they want it resolved. Stopping on a real ambiguity is better than committing a silently-wrong merge — the autonomy is there to save the user time, not to manufacture false confidence.
