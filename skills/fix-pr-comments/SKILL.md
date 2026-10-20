---
name: fix-pr-comments
description: >-
  Find and address every GitHub pull-request comment — inline threads, top-level
  comments, and review summaries — then automatically verify, commit, push, reply, and
  resolve handled threads. Also make the PR mergeable by resolving base conflicts and
  fixing failing CI. Use when the user asks to fix, address, or handle PR feedback,
  review comments, requested changes, bot suggestions (CodeRabbit, Copilot, Sonar),
  unresolved threads, merge conflicts, or red checks, or asks to get a PR green and
  mergeable, including when they provide a PR number or URL.
---

# Fix all PR comments

Go through every piece of feedback on a pull request, make the changes it asks for, and close the loop by replying to each thread and resolving the ones you addressed. Along the way, clear whatever else blocks the merge: conflicts with the base branch and failing CI checks. The goal is that when you're done, a maintainer can scroll the PR and see every comment either fixed-and-resolved or answered-with-a-reason — nothing silently ignored — on a branch that merges cleanly with green checks.

## The contract

Treat invocation of this skill as authorization to complete the normal PR-review workflow end to end:

- **Work autonomously through delivery.** Fetch comments, check mergeability and CI, triage, edit code, merge the base branch and resolve conflicts when needed, verify, commit, push to the PR head branch, post replies, resolve handled threads, and watch the new checks. Do not pause for a second approval before the commit/push/reply batch. The final report is the user's control surface. Read the code around each comment before changing it; a reviewer's one-line note often implies more than it says.
- **Honor narrower instructions.** If the user explicitly says not to push, asks for a local-only fix, or wants drafts before public replies, follow that boundary instead.
- **Pause for exceptional risk or ambiguity.** Stop before pushing when the PR or target branch cannot be identified confidently, the writable branch belongs to someone else, required access is missing, or completion would materially expand scope beyond the review feedback.
- **Force-pushes always pause.** Never rewrite pushed history (rebase + force-push) without explicitly asking first — it orphans review threads and stomps on anyone tracking the branch.

Never resolve a thread you didn't actually address. Resolving is a claim that the concern is handled — keep it honest.

## Step 1 — Identify the PR

- No argument → the PR for the current branch.
- A number (`123`) → that PR in the current repo.
- A URL → that PR (works across repos).

If the target is a specific PR that isn't checked out, run `gh pr checkout <number>` first so your edits land on its head branch. Confirm you're on the right branch before editing.

## Step 2 — Gather ALL the comments

Run the consolidation script — it pulls the four comment surfaces GitHub keeps in separate APIs and merges them, with the ids you need to reply and resolve:

```bash
python3 scripts/fetch_pr_comments.py [PR] > /tmp/pr_comments.json
```

(`scripts/` is relative to this skill directory.) Read the JSON. The shape:

- `threads[]` — inline review threads. Each has `is_resolved`, `is_outdated`, `path`, `line`, the full comment chain, plus `root_comment_id` (for replying) and `thread_id` (for resolving).
- `review_summaries[]` — the body of each review (often where "changes requested" rationale lives).
- `issue_comments[]` — top-level conversation comments.
- `counts` — quick totals. `viewer` — the current user's login (so you can tell apart your own comments).

## Step 3 — Check what else blocks the merge: conflicts & CI

Comments aren't the only thing standing between the PR and a merge. Check both up front so they're part of the same pass:

```bash
gh pr view [PR] --json mergeable,mergeStateStatus,baseRefName,headRefName
gh pr checks [PR]
```

- `mergeable: CONFLICTING` (or `mergeStateStatus: DIRTY`) → the branch conflicts with its base; plan a conflict-resolution step. `UNKNOWN` means GitHub is still computing — retry after a few seconds.
- `mergeStateStatus: BEHIND` → no conflicts, but the repo requires up-to-date branches; merge the base in as part of the same pass.
- `gh pr checks` → record every failing check now so nothing is forgotten, but **diagnose them later** (Step 7): they ran against the old head commit, and the conflict merge or the comment fixes may make some of them moot. Pending checks are unknowns — Step 11 catches them.

## Step 4 — Triage every comment

Don't treat every comment as "make this edit." Read each, decide what it actually wants, and sort it. Build a short triage table for yourself (and for the user) — one row per actionable thread: location, what it asks, your planned action, and whether you'll resolve.

Categories and how to handle them:

| Kind of comment | What to do | Resolve after? |
|---|---|---|
| Change request / bug / nit | Make the code change | Yes |
| Question | Answer it in a reply; change code only if the answer implies one | Yes, once answered |
| Suggestion you disagree with or that's out of scope | Reply explaining the reasoning; **do not** change the code | **No** — leave for the human |
| Praise / FYI / "nice" | Brief acknowledgment at most | Yes (it's not an open concern) |
| Already `is_resolved` | Skip entirely | — |
| Authored only by `viewer` (your own note) | Skip, unless it's clearly a TODO left for this pass | — |

Guidance that matters:

- **Disagreement is allowed, silence is not.** If a suggestion is wrong, makes the code worse, or is out of scope, say so plainly and leave the thread open for the reviewer — don't resolve your way out of a real disagreement, and don't make a change you think is wrong just to clear a thread.
- **Bot reviewers (CodeRabbit, Copilot, Sonar, etc.)** are often right and often verbose. Apply the same judgment as for a human; decline the low-value ones with a one-line reason rather than making bad changes to appease them.
- **Outdated threads** (`is_outdated: true`) mean the line moved, not that the concern is gone. Check `diff_hunk` against the current file. If the issue already got fixed incidentally, reply noting that and resolve; if it still applies, fix it.
- **Duplicate/overlapping comments** — fix the underlying thing once, then reply to and resolve each thread that pointed at it.
- **`review_summaries` and `issue_comments`** can't be resolved (no thread). Fold their asks into your code changes and, if a response is warranted, post one top-level reply with `respond.py pr-comment` rather than many.

## Step 5 — Resolve merge conflicts (if any)

Do this **before** the comment edits, so those land on up-to-date code and you only verify once:

```bash
git fetch origin
git merge origin/<baseRefName>   # merge, don't rebase — a rebase needs a force-push, which orphans review threads
```

For each conflicted file:

- Read both sides and understand what each was trying to do. The usual right answer keeps **both intents** — the base branch's change and this PR's. Taking one side wholesale is rarely correct.
- Generated files (lockfiles, snapshots, build output) are never hand-merged: take either side, then regenerate with the real tool (`pnpm install`, the snapshot-update command, etc.).
- If both sides rewrote the same logic incompatibly, prefer the base branch's structure and re-apply this PR's purpose on top of it — and flag that resolution in the report; it's the kind reviewers most want to see.

Conclude the merge (`git add` the resolutions, `git commit`), and make sure the project still builds before moving on. If the repo genuinely requires a rebase/linear history instead, that's a force-push — pause and ask, even in end-to-end mode.

One side effect to remember: the merge can shift line numbers under existing review threads. In Step 6, locate each comment's target by its `diff_hunk` content, not just the recorded line.

## Step 6 — Make the changes

Work **file by file**, not comment by comment, so related edits batch together and you load each file's context once. Keep edits minimal and in the style of the surrounding code (match its naming, comment density, and idioms). If two comments conflict, make the better choice and note the trade-off in both replies.

## Step 7 — Fix failing CI (if any)

Now diagnose the failing checks you recorded in Step 3. They ran against the old head commit, so re-check each one against your updated tree before chasing it:

1. **Reproduce locally first.** Find the command the workflow actually runs (look in `.github/workflows/`) and run it. If it passes now, the conflict merge or a comment fix already covered it — nothing to do.
2. **Still failing → read the real logs.** For a GitHub Actions check, the run id is in the check's link (`.../actions/runs/<run-id>/...`); then `gh run view <run-id> --log-failed`. Fix the code the test caught. Only change the test itself when it asserts old behavior this PR intentionally changed — and say so in the report.
3. **External checks** (deploy previews, coverage gates, code scanners) that can't run locally: read their details page, fix what's actionable, and flag the rest in the report.
4. **Genuine flake or infra failure** (runner died, network timeout, unrelated to the diff, passes locally): don't "fix" code that isn't broken — plan to rerun it after the push with `gh run rerun <run-id> --failed`. One rerun max before treating it as real.

A failure that also reproduces on the base branch isn't this PR's job to fix — note it in the report instead of expanding the PR's scope.

## Step 8 — Verify

Before going public, make sure the changes actually hold together: build / typecheck / lint / run the tests that cover what you touched — including the exact commands from any CI jobs you fixed in Step 7. If something a reviewer asked for would break the build, that's a finding to raise in the reply, not a change to push.

## Step 9 — Commit & push automatically

Commit the work in logical chunks with messages that reference the feedback (e.g. `fix(api): validate empty payload (PR review)`); the conflict-resolution merge commit rides along in the same push. Push to the PR's head branch without asking for another approval so your replies can point at concrete commits. Follow the repo's commit conventions; end commit messages with the co-author trailer if that's the house rule. Pause only for the exceptions in **The contract**, especially any force-push.

## Step 10 — Reply & resolve

For each thread, post a reply and (when appropriate) resolve it:

```bash
# reply + resolve in one go (the common case for a change you made)
python3 scripts/respond.py reply-resolve \
  --repo OWNER/REPO --pr N \
  --comment-id <root_comment_id> --thread-id <thread_id> \
  --body-file /tmp/reply.md

# reply only (disagreement / needs reviewer's call — leave it open)
python3 scripts/respond.py reply \
  --repo OWNER/REPO --pr N --comment-id <root_comment_id> --body-file /tmp/reply.md
```

Write each reply to a file first, then pass `--body-file` (multi-line markdown survives intact). Reply style: specific and short. Say what you did and point at the commit — "Done in `a1b2c3d` — pulled the validation into `validateInput()` and added the null guard." For a decline: "Leaving this — the alloc only happens in the test path, so it's not worth the indirection. Happy to revisit if you feel strongly." Skip the throat-clearing and over-apologizing.

## Step 11 — Confirm CI comes back green

The push re-triggers the checks against your new commit. Watch them finish:

```bash
gh pr checks [PR] --watch
```

- All green → done; say so in the report.
- The flake you predicted in Step 7 → `gh run rerun <run-id> --failed`, then watch again.
- A **new** failure → loop back to Step 7 and fix it; never report success while checks are red.

`--watch` blocks until checks complete, so give it a sensible timeout. If a long suite is still pending when you need to report, say exactly which checks are pending and what you verified locally — don't claim green.

## Step 12 — Final report

Because the local phase ran autonomously, the report is how the user audits it. Lead with the merge-blockers: conflicts resolved (which files, how, the merge commit) and each CI check — fixed, rerun-as-flaky, still pending, or still red and why. Then, per thread: the comment, what you did (or why you didn't), the commit, and whether you resolved it. Make the declines and anything you left open easy to spot — those are what the user most needs to review. End with the counts (addressed, declined-with-reason, left-open, couldn't act) and the PR's final state: mergeable or not, checks green/pending/red.

## Pitfalls

- Don't push to someone else's fork branch you can't write to — if push fails, report it and hand the diff back rather than losing the work.
- Don't mass-resolve to make the PR look clean. An unresolved thread with a thoughtful reply is the correct outcome for a genuine disagreement.
- Never rebase + force-push a reviewed PR to resolve conflicts without explicit permission — merge the base in instead.
- Don't hand-merge lockfiles or other generated files in a conflict; regenerate them with the real tool.
- Don't declare a check "flaky" without reading its log, and rerun at most once before treating the failure as real.
- `gh` must be authenticated (`gh auth status`). The script needs `repo` scope to post and resolve.
- Large PRs: trust `counts.actionable_threads` over the noise — already-resolved threads and your own comments are not work.

## References

- `references/github-pr-comments.md` — the GitHub comment model (threads vs. reviews vs. issue comments), the GraphQL/REST endpoints behind the scripts, and how to do things by hand if a script ever falls short.
