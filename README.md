# max-skills

A growing collection of agent skills for [Claude Code](https://claude.com/claude-code), [Codex](https://github.com/openai/codex), and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

| Skill | What it does |
|---|---|
| [`pr-screenshots`](skills/pr-screenshots/SKILL.md) | Runs your app locally, screenshots every screen a PR touches (desktop + mobile) and shows each one BEFORE (base branch) and AFTER (the PR) side by side, with the changes boxed in red, all embedded in the PR description. |
| [`pr-video`](skills/pr-video/SKILL.md) | Records a captioned end-to-end demo of what a PR does — multi-actor flows included — and attaches a GIF + MP4 to the PR description, led by BEFORE/AFTER stills of the screens it changed. |
| [`pr-summary`](skills/pr-summary/SKILL.md) | Summarizes the current branch or PR into a 1–3 bullet, plain-language team update ending with the PR link — paste-ready for Slack. |
| [`fix-pr-comments`](skills/fix-pr-comments/SKILL.md) | Works through every comment on a PR (inline threads, review summaries, conversation), makes the fixes, clears merge conflicts and red CI, then replies to each thread and resolves the ones it handled. |
| [`merge-develop`](skills/merge-develop/SKILL.md) | Merges the latest `develop` (or any base branch) into your branch, resolves every conflict so both sides' intent survives, runs the builds and tests, and reports each decision. Never pushes. |
| [`new-project`](skills/new-project/SKILL.md) | Takes an empty folder and an idea to a researched PRD, a brand with design tokens, then a scaffolded pnpm monorepo: Next.js web, Expo mobile, and a Rust/Axum API with email and Google sign-in. |
| [`github-weekly-showcase`](skills/github-weekly-showcase/SKILL.md) | Turns your week of GitHub work in a repo (PRs, reviews, commits, issues) into a polished, print-friendly HTML brief with a JSON evidence file. |

Both media skills run the PR's base branch next to the PR on the same data, so every run includes a before/after with the changes boxed and labeled. They publish with plain `git` + `gh` (a dedicated `docs/pr-<n>-<slug>-media` branch, embedded by commit SHA), so they work on private repos with no browser upload — and both preview the PR body and ask before writing anything.

## Install

Any of these — pick the one that matches how you manage skills:

**`skills` CLI** (Claude Code, Codex, Cursor and 40+ other agents):

```bash
npx skills add vasinl124/max-skills
```

Narrow it with `--skill pr-video` or `-a claude-code -a codex`.

**Claude Code plugin** — the repo is also a plugin marketplace, so `claude plugin update` brings new versions:

```bash
claude plugin marketplace add vasinl124/max-skills
claude plugin install max-skills@max-skills
```

Plugin skills carry the plugin prefix, e.g. `/max-skills:pr-video` or `/max-skills:fix-pr-comments`.

**Codex** — ask `$skill-installer` to install from `vasinl124/max-skills`, or run its script directly:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo vasinl124/max-skills --path skills/pr-screenshots skills/pr-video skills/pr-summary \
  skills/fix-pr-comments skills/merge-develop skills/new-project skills/github-weekly-showcase
```

**Clone + symlink** — edits and `git pull` are live in every agent:

```bash
git clone https://github.com/vasinl124/max-skills.git
cd max-skills
./link.sh ~/.claude/skills ~/.codex/skills
```

Pass whichever skills directories your agents read — Claude Code uses `~/.claude/skills`; Codex uses `~/.agents/skills` (older versions: `~/.codex/skills`). `link.sh` never overwrites anything that's already there.

## Use

Ask in plain words ("screenshot this PR", "record a demo of this PR", "summarize this PR for the team", "fix the review comments on this PR", "merge develop into my branch", "let's build a new app", "make my weekly GitHub report") or invoke a skill by name: `/fix-pr-comments` in Claude Code, `$fix-pr-comments` in Codex.

## Requirements

Nothing to `npm install` for the skills themselves — the scripts use only Node built-ins and standard CLI tools:

- `git`, [`gh`](https://cli.github.com) (authenticated), and Node 18+ — `pr-summary` needs only the first two
- **Playwright** — the skills reuse the copy already in your project, so nothing global. No Playwright in your project? Point `--app-dir` at any folder that has it. Browser not downloaded? Run `npx playwright install chromium`, or pass `--channel chrome` to use the Chrome you already have.
- `pr-video` only: `ffmpeg`/`ffprobe` (4.3+), ImageMagick, `python3` — `brew install ffmpeg imagemagick` or `apt install ffmpeg imagemagick`
- `fix-pr-comments` and `github-weekly-showcase`: `python3` and `gh`. `merge-develop`: `git` plus your project's own build and test tools. `new-project`: `pnpm`, a Rust toolchain and Docker once it scaffolds.

Developed and tested on macOS; written to be Linux-compatible (bash + GNU tools). On Windows, use WSL.

## Teach it your project

The skills are deliberately generic. Anything project-specific — which dev command to run, ports, auth bypass, seed data, actions that are unsafe to fire locally — belongs in your repo's `AGENTS.md` / `CLAUDE.md`, where the agent reads it before running the app.

## Adding a skill

Create `skills/<name>/SKILL.md` (the frontmatter `name` must match the directory), keep scripts in `skills/<name>/scripts/` and reference them relative to the skill, then run `./test.sh` and `./link.sh <your skills dirs>`. Scripts shared by several skills are duplicated on purpose so each skill installs standalone; `test.sh` fails if the copies drift.

## License

[MIT](LICENSE)
