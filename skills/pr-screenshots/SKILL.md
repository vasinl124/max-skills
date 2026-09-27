---
name: pr-screenshots
description: Screenshot every screen a pull request touches by running the app locally, show each one BEFORE (base branch) and AFTER (the PR) side by side with the changes boxed in red, then post everything straight into the GitHub PR description — no human copy/paste. Use when the user asks to screenshot a PR, capture the screens/UI a PR changes, compare before and after, show what a PR changed visually, add screenshots to a PR description or comment, or "grab shots of what this PR does". Runs the base branch and the PR locally on the same data, captures each affected route with Playwright (or the agent's browser tool), annotates what changed, and publishes the images to the PR with gh — pushed to a dedicated docs/pr-<n>-media branch and embedded in the description, no browser upload needed.
license: MIT
---

# PR Screenshots

Turn a pull request into screenshots embedded in its description, with zero manual copy/paste. The hard parts this skill solves: (1) figuring out **which screens** a diff actually affects, (2) running the app locally to reach them, (3) showing **what changed**: every run pairs each screen with the base branch on the same data, BEFORE | AFTER, with the differences boxed in red, so a reviewer sees the change instead of hunting for it, and (4) getting images **into the PR body — private repos included** — so they render for every viewer.

Work in this order. Confirm with the user before the one irreversible step (writing to the PR).

## 0. Prerequisites & context

- `gh` must be authenticated (`gh auth status`). Scripts infer the PR from the current branch unless you pass `--pr <n>`.
- Screenshot capture needs **Playwright**, resolved from `--app-dir` — normally the target app's own copy, so nothing global. Point `--app-dir` at the package whose `node_modules` has `@playwright/test`, `playwright` or `playwright-core` (in a monorepo, usually the web app's package). Two first-run snags, both with easy outs:
  - *Playwright's browser isn't downloaded* (the script says so and exits 3): run `npx playwright install chromium` in that package, **or** pass `--channel chrome` to use the installed Google Chrome — no download.
  - *The project has no Playwright at all*: `--app-dir` can be **any** folder that has it, so don't add a dependency to the user's project just for this. With the user's OK, make a scratch one (`mkdir -p ~/.cache/pr-media && cd ~/.cache/pr-media && npm init -y && npm i playwright`) and point `--app-dir` there with `--channel chrome` — or use your agent's browser tool instead (step 3).
- **Publishing images needs only `gh` — no browser.** `publish-media.sh` pushes the PNGs to a dedicated `docs/pr-<n>-<slug>-media` branch and prints commit-pinned URLs; you embed them in the PR body as `blob/<sha>/<file>?raw=true`, which renders inline for anyone who can see the PR (private repos included — the viewer is authenticated). See step 4.
- **Scripts live in `scripts/` next to this file**: `capture.mjs`, `before-after.mjs` (BEFORE | AFTER pairs with the changes boxed, and an optional numbers card), `alloc-ports.mjs`, `publish-media.sh` (push media to a branch via gh → SHA-pinned URLs), `update-pr-body.mjs` (idempotent body splice). In the commands below, `$SKILL_DIR` is the absolute path of the directory containing this `SKILL.md` — wherever your agent installed it (e.g. `~/.claude/skills/pr-screenshots` or `~/.codex/skills/pr-screenshots`). Shell state usually doesn't persist between an agent's shell calls, so substitute the literal path or set `SKILL_DIR=…` at the start of each command.
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

### 2b. Run the base branch too — the BEFORE

A second stack from the PR's base branch, next to the PR's own, is what makes the before/after possible. Check it out in its own worktree so the PR checkout stays untouched:

```bash
BASE=$(gh pr view --json baseRefName -q .baseRefName)
git fetch -q origin "$BASE"
git worktree add --detach "${TMPDIR:-/tmp}/pr-media/$PR/before" "origin/$BASE"
```

- **Dependencies**: install them in that worktree the way the project does. If no lockfile changed between base and head (`git diff --quiet "origin/$BASE"...HEAD -- '*lock*'`), symlinking the PR checkout's `node_modules` is usually enough and much faster. Copy the same gitignored env files (see the note above).
- **Ports**: allocate both stacks in one call so they can't collide — e.g. `--near 3000,3100` for AFTER and BEFORE web ports (add API ports as needed) — and point each frontend at its own backend.
- **Same data on both sides, or the comparison lies.** Seed both from the same fixtures or snapshot. A file database (SQLite, JSON store): give each side its own copy of the same snapshot, since the PR may migrate it. A shared dev database is fine for read-only screens unless the PR adds migrations; then give BEFORE its own copy or schema.
- **Effects that need a run.** When what the PR changes only shows after something runs (an import, a sync, a pipeline, a cron job), run it on both sides from that same starting data, so AFTER shows what the PR produces and BEFORE shows what the base produces today. Note what that run yields on each side (counts, timings, sizes): those numbers go on the card in step 3b.
- **When BEFORE can't run** (the base doesn't build, a migration it can't undo), say so and fall back to AFTER-only screenshots. Never fake a BEFORE.
- **Teardown**: kill its dev processes (the `pkill -f "<path>/node_modules"` pattern above), then `git worktree remove --force "${TMPDIR:-/tmp}/pr-media/$PR/before"`.

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

### 3b. Before/after pairs

For each screen from step 1, write a **scene**: the same path and the same state on both stacks, plus what to box. `before-after.mjs` opens both, runs the steps, boxes the elements you name, and joins the two shots side by side under a title:

- **AFTER** — box what's new or different, labeled with 2 to 5 words: `NEW  Pay range vs target`, `Changed  Sort order`.
- **BEFORE** — box the matching spot as it was (`No pay info`, `Still on your shortlist`), so the eye can jump straight across.
- **Brand-new screens**: pair them with what the user saw at that entry point before (the empty state, the page without the feature). Never fabricate a BEFORE.
- **Box by CSS selector, not pixels.** The script measures the element, so boxes land exactly. `withNext` boxes a label/value row (dt + dd), `text` picks the element with that text, `tight` hugs the text instead of a full-width block, `all` boxes the union of every match.
- Labels go where `at` asks unless that would cover text; then the script picks the spot that covers least.

```json
[
  { "name": "job-page", "title": "A job page", "path": "/jobs/746",
    "steps": [{ "waitFor": ".props" }],
    "before": [{ "sel": ".props dt:nth-of-type(-n+2), .props dd:nth-of-type(-n+2)", "all": true, "label": "Fit and remote only" }],
    "after":  [{ "sel": ".props dt", "text": "Pay", "withNext": true, "label": "NEW  Pay range vs target", "at": "right" },
               { "sel": ".props dt", "text": "Company", "withNext": true, "label": "NEW  Other roles + application cap", "at": "right" }] },
  { "name": "form-answers", "title": "Under the cover letter", "path": "/jobs/746",
    "steps": [{ "waitFor": ".props" }],
    "beforeSteps": [{ "scrollTo": "details.posting", "offset": 600 }],
    "afterSteps":  [{ "open": ".helper.answers" }, { "scrollTo": ".helper.answers", "offset": 260 }],
    "before": [{ "sel": "details.posting", "label": "Letter, then the description", "at": "right" }],
    "after":  [{ "sel": ".helper.answers", "label": "NEW  Form answers, with Copy", "at": "right" }] }
]
```

Steps are `waitFor`, `click`, `open` (a `<details>`), `scrollTo` (scrolls the element's own container, a side pane or the page, to `offset` px below its top), `wait` and `eval`; `beforeSteps`/`afterSteps` cover a DOM that differs between the two, and `beforePath`/`afterPath` a route that moved.

```bash
node "$SKILL_DIR/scripts/before-after.mjs" \
  --app-dir "$(git rev-parse --show-toplevel)" \
  --before-url http://127.0.0.1:3100 --after-url http://127.0.0.1:3000 \
  --scenes scenes.json --out "${TMPDIR:-/tmp}/pr-media/$PR/before-after" \
  --before-label "BEFORE  $BASE" --after-label "AFTER  PR #$PR"
```

It writes `<name>.png` (the titled pair), `<name>--before.png` and `<name>--after.png` (each side at 2x, for zooming), and `manifest.json`: `missing` lists any box whose element wasn't found or was off screen, and `moved` any label that couldn't go where `at` asked (usually too long to fit there; shorten it). Same flags as `capture.mjs` for `--channel chrome`, `--viewport` (run it again at `390x844` when the change is mobile-specific) and `--wait`.

**When the change is measurable** — more results, faster, fewer errors — measure it on both sides at the same moment and add a numbers card: `--card card.json --card-title "PR #$PR, before and after"`, rows like `{ "section": "Finding jobs", "label": "New postings on one fetch", "before": "70", "after": "813", "note": "same data, same moment" }`. Only numbers you measured; say how in the note.

Review every pair before publishing: both sides show the same record and scroll position, every box sits on the right element (check `missing`), and no label hides what it points at or strays onto an unrelated part of the screen (check `moved`). A wrong box is a scene fix and a re-run, which takes seconds.

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

Publish the before/after pairs (and the card) in the same `publish-media.sh` call, so every image shares one SHA. Build `before-after.md` first; it goes **above** the screenshots, because it is what a reviewer reads first:

```markdown
## 🔍 Before / After

![A job page](PAIR_URL)

![Before and after, in numbers](CARD_URL)

<details><summary>Each side at full size</summary>

| Before | After |
|---|---|
| ![](BEFORE_URL) | ![](AFTER_URL) |

</details>
```

Then build a tidy `section.md` for the screenshots. Group each screen's desktop + mobile shot; wrap long lists in `<details>`:

```markdown
## 📸 Screenshots

<details open><summary><b>Settings · Billing</b></summary>

| Desktop | Mobile |
|---|---|
| ![](DESKTOP_URL) | ![](MOBILE_URL) |

</details>
```

Then **preview** the merged body (idempotent — replaces its own marked block on re-runs, never duplicates). Preview the before/after block first so it lands above the screenshots:

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker before-after --section-file before-after.md
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker screenshots --section-file section.md
```

## 5. Confirm, then publish

Editing a PR description is public-content modification — **show the user the before/after pairs and the assembled body (the preview file paths from step 4) and get an explicit yes.** Only then re-run both with `--write`, before/after first:

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker before-after --section-file before-after.md --write
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker screenshots --section-file section.md --write
```

Report the PR URL. Because each section sits between its own `<!-- pr-before-after:… -->` / `<!-- pr-screenshots:… -->` markers, running the whole skill again after new commits refreshes the images in place.

## Guardrails

- **Never post without confirmation** (step 5). Preview is the default; `--write` is the deliberate act.
- **The media branch is as visible as the repo.** On a public repo, anyone can see what you push there — check every shot for secrets, tokens, and real names/emails before step 4.
- **Don't screenshot production with real data.** These flows assume local dev with seed/placeholder data. If pointed at a deployed environment, treat the screens as potentially containing real customer PII and stop to confirm.
- **Don't perform writes while capturing** unless the app is confirmed to point at a local/staging backend (guardrail in step 2).
- **Same data on both sides.** A BEFORE and AFTER on different data mislead a reviewer; if you can't arrange the same data, say so next to the pair.
- If there's no PR for the branch yet, create it first (`gh pr create`) or ask — this skill edits an existing PR, it doesn't invent one.
