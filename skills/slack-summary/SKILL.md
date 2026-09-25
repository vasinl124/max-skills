---
name: slack-summary
description: Alias of pr-summary under its old name, kept so /slack-summary keeps working and installs on its own. Use only when the user explicitly invokes /slack-summary (or $slack-summary in Codex); for any other request — PR summary, Slack summary, branch update — use pr-summary directly.
---

Summarize what a pull request (or the current branch) changes into a short message for the team, paste-ready for Slack.

Steps:
1. Pick the target. If the user named a PR (number, URL or branch), use it as `<pr>` in every `gh` command below; otherwise drop `<pr>` and `gh` resolves the PR of the checked-out branch.
2. Run `gh pr view <pr> --json url,title,body,commits --jq '{url,title,body,commits:[.commits[].messageHeadline]}'` for the link, description and commit list, then `gh pr diff <pr> --name-only` for the changed files. Both compare against the PR's real base on GitHub, so they are right whatever the default branch is called, whatever is checked out locally, and however far the base has moved since the branch diverged.
3. No PR (`gh pr view` fails with "no pull requests found")? Compare the branch against the repo's default branch on GitHub instead — `<branch>` is the branch the user named, else `git branch --show-current`. This needs no local remote and no fetch: `base=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name) && gh api "repos/{owner}/{repo}/compare/$base...<branch>" --jq '{commits:[.commits[].commit.message|split("\n")[0]], files:[.files[].filename]}'`. A 404 means the branch isn't on GitHub yet: ask the user to push it, or summarize from a local `git log $base..HEAD --oneline` and say the comparison is local. Open with "Here is what's on this branch:" and end with `Branch: <branch> (no PR yet)` instead of the PR line.
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
