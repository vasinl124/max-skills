---
name: pr-summary
description: Summarize a pull request — or the current branch — into a concise, plain-language team update ending with the PR link, paste-ready for Slack. Use when the user asks for /pr-summary, a PR summary, a Slack summary, or a short update on what a branch or PR does. Takes an optional PR number, URL or branch name.
---

Summarize what a pull request (or the current branch) changes into a short message for the team, paste-ready for Slack.

Steps:
1. Pick the target. If the user named a PR (number, URL or branch), use it as `<pr>` in every `gh` command below; otherwise drop `<pr>` and `gh` resolves the PR of the checked-out branch.
2. Run `gh pr view <pr> --json url,title,body,commits --jq '{url,title,body,commits:[.commits[].messageHeadline]}'` for the link, description and commit list, then `gh pr diff <pr> --name-only` for the changed files. Both compare against the PR's real base on GitHub, so they are right whatever the default branch is called, whatever is checked out locally, and however far the base has moved since the branch diverged.
3. No PR (`gh pr view` fails with "no pull requests found")? Compare the branch against the repo's default branch on GitHub instead — no local remote, no fetch, but the branch must be pushed. One shell call:
   ```bash
   branch=$(git branch --show-current); [ -n "$branch" ] || branch=$(git rev-parse HEAD)   # detached HEAD → the commit
   # user named a branch? set branch='<name>' instead — if the name has anything besides letters, digits and ._-/ stop and ask rather than paste it into the shell
   base=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
   enc() { printf '%s' "$1" | sed 's/%/%25/g; s/#/%23/g; s/{/%7B/g; s/}/%7D/g'; }   # URL-significant characters Git allows in a ref, plus gh's {placeholders}
   gh api "repos/{owner}/{repo}/compare/$(enc "$base")...$(enc "$branch")" --jq '{total_commits, commits:[.commits[].commit.message|split("\n")[0]], files:[.files[].filename]}'
   ```
   If `total_commits` exceeds the commits listed or exactly 300 files come back, GitHub capped the response: say the summary is based on a partial list. A 404 means the branch isn't on GitHub: ask the user to push it (don't push for them). Open with "Here is what's on this branch:" and end with `Branch: $branch (no PR yet)` instead of the PR line.
4. If the list looks polluted by merge commits from the base branch, trust the PR title/body for the real scope, not the raw diff. Read key changed files only if still unclear (`gh pr diff <pr>` prints the full diff).

Output rules:
- Very concise — 1-3 short bullets max, one line each
- Terse, plain language a non-technical PM could understand
- No emojis, no implementation details, no preamble
- Do not wrap in code blocks — output the message directly as text
- End with the PR link in this format:

```
Here is what's in this PR:
- bullet one
- bullet two
- bullet three

PR: <url from gh pr view>
```
