---
name: slack-summary
description: Alias of pr-summary under its old name. Use only when the user explicitly invokes /slack-summary (or $slack-summary in Codex); for any other request — PR summary, Slack summary, branch update — use pr-summary directly.
---

`slack-summary` was renamed to `pr-summary`; this alias only exists so the old name keeps working. Do exactly what the `pr-summary` skill says, with the same arguments: invoke it through your skill tool if you have one (`Skill` in Claude Code), otherwise read `../pr-summary/SKILL.md` — installed alongside this file — and follow it.
