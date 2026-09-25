---
name: pr-summary
description: Summarize the current branch or pull request into a concise, plain-language team update ending with the PR link — paste-ready for Slack. Use when the user asks for /pr-summary, a PR summary, a Slack summary, or a short update on what a branch or PR does.
---

Summarize the current branch's changes into a short message for the team (paste-ready for Slack).

Steps:
1. Run `git log main..HEAD --oneline` to see all commits on this branch
2. Run `git diff main --stat` to see changed files
3. Run `gh pr view --json url,title,body -q '{url,title,body}'` to get the PR link and description
4. If the diff looks polluted by merge commits from develop/main, trust the PR title/body for the real scope, not the raw diff. Read key changed files only if still unclear.

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
