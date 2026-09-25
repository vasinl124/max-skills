# max-skills

A growing collection of agent skills for [Claude Code](https://claude.com/claude-code), [Codex](https://github.com/openai/codex), and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

| Skill | What it does |
|---|---|
| [`pr-screenshots`](skills/pr-screenshots/SKILL.md) | Runs your app locally, screenshots every screen a PR touches (desktop + mobile), and embeds the images in the PR description. |
| [`pr-video`](skills/pr-video/SKILL.md) | Records a captioned end-to-end demo of what a PR does — multi-actor flows included — and attaches a GIF + MP4 to the PR description. |
| [`pr-summary`](skills/pr-summary/SKILL.md) | Summarizes the current branch or PR into a 1–3 bullet, plain-language team update ending with the PR link — paste-ready for Slack. |

The two media skills publish with plain `git` + `gh` (a dedicated `docs/pr-<n>-<slug>-media` branch, embedded by commit SHA), so they work on private repos with no browser upload — and both preview the PR body and ask before writing anything.

## Install

```bash
npx skills add vasinl124/max-skills
```

That uses the [`skills`](https://github.com/vercel-labs/skills) CLI, which installs into whichever agents you have. Narrow it with `--skill pr-video` or `-a claude-code -a codex`.

Or clone and symlink, so `git pull` updates the skills in place:

```bash
git clone https://github.com/vasinl124/max-skills.git
cd max-skills
./link.sh ~/.claude/skills ~/.codex/skills
```

Pass whichever skills directories your agents read — Claude Code uses `~/.claude/skills`; Codex uses `~/.agents/skills` (older versions: `~/.codex/skills`). `link.sh` never overwrites anything that's already there.

## Use

Ask in plain words — "screenshot this PR", "record a demo of this PR", "summarize this PR for the team" — or invoke explicitly: `/pr-screenshots`, `/pr-video` and `/pr-summary` in Claude Code, or the same names with a `$` prefix in Codex.

## Requirements

Nothing to `npm install` for the skills themselves — the scripts use only Node built-ins and standard CLI tools:

- `git`, [`gh`](https://cli.github.com) (authenticated), and Node 18+ — `pr-summary` needs only the first two
- **Playwright** — the skills reuse the copy already in your project, so nothing global. No Playwright in your project? Point `--app-dir` at any folder that has it. Browser not downloaded? Run `npx playwright install chromium`, or pass `--channel chrome` to use the Chrome you already have.
- `pr-video` only: `ffmpeg`/`ffprobe` (4.3+), ImageMagick, `python3` — `brew install ffmpeg imagemagick` or `apt install ffmpeg imagemagick`

Developed and tested on macOS; written to be Linux-compatible (bash + GNU tools). On Windows, use WSL.

## Teach it your project

The skills are deliberately generic. Anything project-specific — which dev command to run, ports, auth bypass, seed data, actions that are unsafe to fire locally — belongs in your repo's `AGENTS.md` / `CLAUDE.md`, where the agent reads it before running the app.

## Adding a skill

Create `skills/<name>/SKILL.md` (the frontmatter `name` must match the directory), keep scripts in `skills/<name>/scripts/` and reference them relative to the skill, then run `./test.sh` and `./link.sh <your skills dirs>`. Scripts shared by several skills are duplicated on purpose so each skill installs standalone; `test.sh` fails if the copies drift.

## License

[MIT](LICENSE)
