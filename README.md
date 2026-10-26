# max-skills

A growing collection of agent skills for [Claude Code](https://claude.com/claude-code), [Codex](https://github.com/openai/codex), and any other agent that reads the open [Agent Skills](https://agentskills.io) format.

| Skill | What it does |
|---|---|
| [`pr-screenshots`](skills/pr-screenshots/SKILL.md) | Runs your app locally, screenshots every screen a PR touches (desktop + mobile) and shows each one BEFORE (base branch) and AFTER (the PR) side by side, with the changes boxed in red, all embedded in the PR description. |
| [`pr-video`](skills/pr-video/SKILL.md) | Records a captioned end-to-end demo of what a PR does — multi-actor flows included — and attaches a GIF + MP4 to the PR description, led by BEFORE/AFTER stills of the screens it changed. |
| [`showcase-demo`](skills/showcase-demo/SKILL.md) | Makes a launch-style showcase video of your product from the running app: real recordings of its best flows, staged with motion graphics (kinetic titles, a camera that pushes in on each action, a drawn cursor, callouts, a stats beat, an intro and a call to action), optionally scored, and rendered with Remotion into an MP4 and a GIF. |
| [`pr-summary`](skills/pr-summary/SKILL.md) | Summarizes the current branch or PR into a 1–3 bullet, plain-language team update ending with the PR link — paste-ready for Slack. |
| [`new-project`](skills/new-project/SKILL.md) | Takes an idea and an empty folder to a PRD grounded in competitor research and real user complaints, a brand with design tokens, and a scaffolded monorepo (Next.js + Expo + a Rust API, with email/password and Google sign-in) that builds and is committed to git — stopping for your sign-off before it writes any code. |

The two PR media skills run the PR's base branch next to the PR on the same data, so every run includes a before/after with the changes boxed and labeled. They publish with plain `git` + `gh` (a dedicated `docs/pr-<n>-<slug>-media` branch, embedded by commit SHA), so they work on private repos with no browser upload — and both preview the PR body and ask before writing anything.

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

Plugin skills carry the plugin prefix: `/max-skills:pr-screenshots`, `/max-skills:pr-video`, `/max-skills:showcase-demo`, `/max-skills:pr-summary`, `/max-skills:new-project`.

**Codex** — ask `$skill-installer` to install from `vasinl124/max-skills`, or run its script directly:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo vasinl124/max-skills --path skills/pr-screenshots skills/pr-video skills/showcase-demo skills/pr-summary skills/new-project
```

**Clone + symlink** — edits and `git pull` are live in every agent:

```bash
git clone https://github.com/vasinl124/max-skills.git
cd max-skills
./link.sh ~/.claude/skills ~/.codex/skills
```

Pass whichever skills directories your agents read — Claude Code uses `~/.claude/skills`; Codex uses `~/.agents/skills` (older versions: `~/.codex/skills`). `link.sh` never overwrites anything that's already there.

## Use

Ask in plain words — "screenshot this PR", "record a demo of this PR", "make a showcase video of the app", "summarize this PR for the team", "let's build a booking app for dog groomers" (in an empty folder) — or invoke explicitly: `/pr-screenshots`, `/pr-video`, `/showcase-demo`, `/pr-summary` and `/new-project` in Claude Code, or the same names with a `$` prefix in Codex.

## Requirements

Nothing to `npm install` for the PR skills — their scripts use only Node built-ins and standard CLI tools:

- `git`, [`gh`](https://cli.github.com) (authenticated), and Node 18+ — `pr-summary` needs only the first two
- **Playwright** — the skills reuse the copy already in your project, so nothing global. No Playwright in your project? Point `--app-dir` at any folder that has it. Browser not downloaded? Run `npx playwright install chromium`, or pass `--channel chrome` to use the Chrome you already have.
- `pr-video` only: `ffmpeg`/`ffprobe` (4.3+), ImageMagick, `python3` — `brew install ffmpeg imagemagick` or `apt install ffmpeg imagemagick`
- `showcase-demo` only: `ffmpeg`, and [Remotion](https://www.remotion.dev), which its `studio.sh` installs once into `~/.cache/showcase-demo` (about 300 MB, plus Remotion's headless Chrome on the first render). Remotion is free for individuals, non-profits and companies of up to 3 people; larger companies need a [company license](https://www.remotion.pro/license)
- `new-project` only: `git`, Node with pnpm, a Rust toolchain ([rustup](https://rustup.rs)), and Docker for the local Postgres — on the machine where the agent scaffolds the project

Developed and tested on macOS; written to be Linux-compatible (bash + GNU tools). On Windows, use WSL.

## Teach it your project

The skills are deliberately generic. Anything project-specific — which dev command to run, ports, auth bypass, seed data, actions that are unsafe to fire locally — belongs in your repo's `AGENTS.md` / `CLAUDE.md`, where the agent reads it before running the app.

## Adding a skill

Create `skills/<name>/SKILL.md` (the frontmatter `name` must match the directory), keep scripts in `skills/<name>/scripts/` and reference them relative to the skill, then run `./test.sh` and `./link.sh <your skills dirs>`. Scripts shared by several skills are duplicated on purpose so each skill installs standalone; `test.sh` fails if the copies drift.

## License

[MIT](LICENSE)
