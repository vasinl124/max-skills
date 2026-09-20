# max-skills

A growing collection of agent skills for [Claude Code](https://claude.com/claude-code), [Codex](https://github.com/openai/codex), and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

| Skill | What it does |
|---|---|
| [`pr-screenshots`](skills/pr-screenshots/SKILL.md) | Runs your app locally, screenshots every screen a PR touches (desktop + mobile), and embeds the images in the PR description. |
| [`pr-video`](skills/pr-video/SKILL.md) | Records a captioned end-to-end demo of what a PR does — multi-actor flows included — and attaches a GIF + MP4 to the PR description. |

Both publish media with plain `git` + `gh` (a dedicated `docs/pr-<n>-<slug>-media` branch, embedded by commit SHA), so they work on private repos with no browser upload — and both preview the PR body and ask before writing anything.

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

Ask in plain words — "screenshot this PR", "record a demo of this PR" — or invoke explicitly: `/pr-screenshots` and `/pr-video` in Claude Code, `$pr-screenshots` and `$pr-video` in Codex.

## Requirements

- [`gh`](https://cli.github.com), authenticated, and Node 18+
- Playwright installed in the project you're capturing (the skills reuse the app's own copy — nothing global)
- `pr-video` only: `ffmpeg`/`ffprobe`, ImageMagick, `python3`

Developed and tested on macOS.

## Teach it your project

The skills are deliberately generic. Anything project-specific — which dev command to run, ports, auth bypass, seed data, actions that are unsafe to fire locally — belongs in your repo's `AGENTS.md` / `CLAUDE.md`, where the agent reads it before running the app.

## Adding a skill

Create `skills/<name>/SKILL.md` (the frontmatter `name` must match the directory), keep scripts in `skills/<name>/scripts/` and reference them relative to the skill, then run `./test.sh` and `./link.sh <your skills dirs>`. Scripts shared by several skills are duplicated on purpose so each skill installs standalone; `test.sh` fails if the copies drift.

## License

[MIT](LICENSE)
