---
name: pr-screenshots
description: Screenshot every screen a pull request touches by running the app locally, then post the images straight into the GitHub PR description — no human copy/paste. Use when the user asks to screenshot a PR, capture the screens/UI a PR changes, add screenshots to a PR description or comment, show before/after of a UI change, or "grab shots of what this PR does". Runs the local dev server, captures each affected route at desktop + mobile with Playwright (or the agent's browser tool), and publishes the images to the PR with gh — pushed to a dedicated docs/pr-<n>-media branch and embedded in the description, no browser upload needed.
license: MIT
---

# PR Screenshots

Turn a pull request into a set of screenshots embedded in its description, with zero manual copy/paste. The hard parts this skill solves: (1) figuring out **which screens** a diff actually affects, (2) running the app locally to reach them, and (3) getting images **into the PR body — private repos included** — so they render for every viewer.

Work in this order. Confirm with the user before the one irreversible step (writing to the PR).

## 0. Prerequisites & context

- `gh` must be authenticated (`gh auth status`). Scripts infer the PR from the current branch unless you pass `--pr <n>`.
- Screenshot capture needs **Playwright**, resolved from `--app-dir` — normally the target app's own copy, so nothing global. Point `--app-dir` at the package whose `node_modules` has `@playwright/test`, `playwright` or `playwright-core` (in a monorepo, usually the web app's package). Two first-run snags, both with easy outs:
  - *Playwright's browser isn't downloaded* (the script says so and exits 3): run `npx playwright install chromium` in that package, **or** pass `--channel chrome` to use the installed Google Chrome — no download.
  - *The project has no Playwright at all*: `--app-dir` can be **any** folder that has it, so don't add a dependency to the user's project just for this. With the user's OK, make a scratch one (`mkdir -p ~/.cache/pr-media && cd ~/.cache/pr-media && npm init -y && npm i playwright`) and point `--app-dir` there with `--channel chrome` — or use your agent's browser tool instead (step 3).
- **Publishing images needs only `gh` — no browser.** `publish-media.sh` pushes the PNGs to a dedicated `docs/pr-<n>-<slug>-media` branch and prints commit-pinned URLs; you embed them in the PR body as `blob/<sha>/<file>?raw=true`, which renders inline for anyone who can see the PR (private repos included — the viewer is authenticated). See step 4.
- **Scripts live in `scripts/` next to this file**: `capture.mjs`, `alloc-ports.mjs`, `publish-media.sh` (push media to a branch via gh → SHA-pinned URLs), `update-pr-body.mjs` (idempotent body splice). In the commands below, `$SKILL_DIR` is the absolute path of the directory containing this `SKILL.md` — wherever your agent installed it (e.g. `~/.claude/skills/pr-screenshots` or `~/.codex/skills/pr-screenshots`). Shell state usually doesn't persist between an agent's shell calls, so substitute the literal path or set `SKILL_DIR=…` at the start of each command.
- **Project-specific knowledge lives with the project, not in this skill**: which dev script to run, ports, auth bypass, seed data, env files, and which actions are unsafe locally. Check the repo's `AGENTS.md` / `CLAUDE.md` / README — and any project-specific companion skill — before step 2. When you learn something non-obvious while running this skill, suggest recording it there.
- Default media output to a temp dir (`$TMPDIR/pr-media/<pr>/…`) so nothing lands in the repo tree. If the user wants them in-repo, use `./.pr-media` and make sure it's gitignored.

## 1. Determine which screens changed

Get the diff and map changed files to routes the user can actually open:

```bash
gh pr view --json number,url,headRefName,baseRefName,title
gh pr diff --name-only        # or: git diff --name-only <base>...HEAD
```

Map files → screens:
- **Route/page files** (`app/**/page.tsx`, `pages/**`, `src/routes/**`, router config) → the URL they serve.
- **Shared components** → find where they're used (grep the imports) and pick the one or two screens that show the change best, not every usage.
- **Monorepo with several apps** (say, a customer app and an admin console) → note which app each changed file belongs to; each app is its own dev server and base URL.
- **Backend / SDK / config-only changes** may have no visible screen — say so rather than screenshotting something unrelated.

Produce a concrete **list of URLs to capture**. If the diff is ambiguous (a shared component used on many screens, or a flow behind interaction), propose the list and ask the user to confirm or trim it.

## 2. Run the app locally

Find the dev command in the project docs or the `package.json` scripts (`dev`, `start`, …).

**Allocate free ports first** so several PR stacks (or other sessions) can run at once. `alloc-ports.mjs` prefers a base and climbs to the next free port if it's taken — which also sidesteps the **stale-server trap**: dev servers and Playwright happily reuse whatever already holds the default port, so you'd screenshot an old checkout. Each shell call is a fresh shell, so **read the numbers it prints and reuse those exact ports** in the launch, the readiness wait, and `--base-url`:

```bash
# one base per server you start → prints e.g. "3002 8787" (WEB, API)
node "$SKILL_DIR/scripts/alloc-ports.mjs" --near 3000,8787
```

Launch the dev server(s) in the background on those ports, however the project takes a port (`PORT=3002 npm run dev`, `npm run dev -- --port 3002`, a project-specific env var, …). If the frontend talks to a local API/worker, start that too and point the frontend at it.

Wait until **its** port answers before capturing, then pass that same port as `--base-url` in step 3:

```bash
until curl -sf "http://127.0.0.1:3002" >/dev/null; do sleep 1; done      # the port you launched
```

> **Fresh worktrees lack gitignored env files.** `.env.local`, `.dev.vars` and friends aren't checked in, so in a new worktree a page can render a "missing config / token" error while the nav shell still looks fine. If a screen shows a config error, find which env file the app expects (copy it from the main checkout or create it per the project docs) and restart — before capturing.

> **Tearing the stack down** isn't always just killing the port: some dev servers respawn children (e.g. `wrangler dev` restarts `workerd`), so killing the listener leaves an orphan that rebinds. Kill the whole tree — `pkill -9 -f "<worktree-path>/node_modules"` targets exactly one checkout's dev processes without touching other sessions'.

> **Guardrail — local can still hit production.** Many apps default an API base URL to the **production** backend even under the dev script. Screenshotting is read-only so this is usually fine, but do **not** click through write actions (submit, book, send, pay) while capturing unless you've confirmed the app points at a local or staging backend — that can create real production records. Capturing pages is safe; performing writes is not.

## 3. Capture the screenshots

Primary — the bundled Playwright capturer (desktop + mobile, full-page). Use the port from step 2; in a monorepo point `--app-dir` at the package that has Playwright (e.g. `…/apps/web`):

```bash
node "$SKILL_DIR/scripts/capture.mjs" \
  --app-dir "$(git rev-parse --show-toplevel)" \
  --base-url http://127.0.0.1:3002 \
  --routes "/,/settings/billing,/#pricing" \
  --out "${TMPDIR:-/tmp}/pr-media/$PR/screenshots"
```

It prints a JSON manifest of `{route, viewport, file}`. Files are named `<route-slug>--desktop.png` / `--mobile.png`. Useful flags: `--channel chrome` uses the installed Chrome instead of Playwright's downloaded browser, `--dismiss-overlay` scrolls once before each shot (for apps with a scroll-dismissed intro overlay), `--wait <ms>` extends the settle time for slow pages, `--viewports "desktop:1440x900"` limits the set, `--no-full-page` captures the viewport only.

Alternative — your agent's **browser tool** (e.g. Claude's in-app browser: `preview_start` → `navigate` → `computer` screenshot, or any Playwright/Chrome MCP) when a screen needs live interaction to reach (open a dialog, fill a field, expand a card) that's easier to drive by hand than to script. Save those PNGs into the same output dir so step 4 treats them uniformly.

Review the shots yourself before continuing. Re-capture any that landed on a spinner, an error boundary, or an intro overlay.

## 4. Put the images into the PR — with gh, no browser

Publish the PNGs to a dedicated media branch and embed them by commit SHA. `publish-media.sh` writes the files as a parentless commit and force-pushes it to `docs/pr-<n>-<slug>-media` (a media-only branch — never your PR/code branch, and it leaves your checkout untouched), then prints the SHA and one URL per file:

```bash
bash "$SKILL_DIR/scripts/publish-media.sh" \
  "docs/pr-$PR-<slug>-media" \
  "${TMPDIR:-/tmp}/pr-media/$PR/screenshots/"*.png
# → sha=<40-hex>
#   settings-billing--desktop.png   https://github.com/<owner>/<repo>/blob/<sha>/settings-billing--desktop.png?raw=true
#   settings-billing--mobile.png    https://github.com/<owner>/<repo>/blob/<sha>/settings-billing--mobile.png?raw=true
```

`<slug>` is a short kebab describing the PR (e.g. `settings-redesign` → `docs/pr-123-settings-redesign-media`). A `blob/<sha>/<file>?raw=true` URL embeds inline for every PR viewer — on a private repo they're authenticated and have repo access, so it renders there too.

Build a tidy `section.md` from the printed URLs. Group each screen's desktop + mobile shot; wrap long lists in `<details>`:

```markdown
## 📸 Screenshots

<details open><summary><b>Settings · Billing</b></summary>

| Desktop | Mobile |
|---|---|
| ![](DESKTOP_URL) | ![](MOBILE_URL) |

</details>
```

Then **preview** the merged body (idempotent — replaces its own marked block on re-runs, never duplicates):

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker screenshots --section-file section.md
```

## 5. Confirm, then publish

Editing a PR description is public-content modification — **show the user the assembled body (the preview file path from step 4) and get an explicit yes.** Only then re-run with `--write`:

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker screenshots --section-file section.md --write
```

Report the PR URL. Because the section sits between `<!-- pr-screenshots:start/end -->` markers, running the whole skill again after new commits refreshes the images in place.

## Guardrails

- **Never post without confirmation** (step 5). Preview is the default; `--write` is the deliberate act.
- **The media branch is as visible as the repo.** On a public repo, anyone can see what you push there — check every shot for secrets, tokens, and real names/emails before step 4.
- **Don't screenshot production with real data.** These flows assume local dev with seed/placeholder data. If pointed at a deployed environment, treat the screens as potentially containing real customer PII and stop to confirm.
- **Don't perform writes while capturing** unless the app is confirmed to point at a local/staging backend (guardrail in step 2).
- If there's no PR for the branch yet, create it first (`gh pr create`) or ask — this skill edits an existing PR, it doesn't invent one.
