---
name: pr-video
description: Record a screen video of the end-to-end flow a pull request enables — including multi-actor flows where a customer does something in one app, an admin acts in another, and it comes back to the customer — then attach the video to the GitHub PR description with no human copy/paste. Use when the user asks to record a video/screen recording/demo/GIF of a PR, capture the e2e or user flow a PR changes, show a walkthrough of a feature, or "record what this PR does end to end". Runs the local dev servers, records each actor with Playwright (own context + video per persona), stitches and captions with ffmpeg, and publishes it to the PR with gh — pushing the media to a dedicated docs/pr-<n>-media branch and linking it from the description, no browser upload needed.
license: MIT
---

# PR Video

Produce a captioned walkthrough video of what a PR does — end to end, across personas — and embed it in the PR description without manual copy/paste. This is the moving-picture sibling of `pr-screenshots`; it reuses the same "run locally → attach to PR" spine but records a **narrative** instead of stills.

Work in order. Confirm with the user before the two consequential steps: **performing write actions in the flow** (they can hit production — see guardrail) and **posting to the PR**.

## 0. Prerequisites & context

- `gh` authenticated (`gh auth status`). Playwright is resolved from the **target app's own** `node_modules` (`--app-dir`) — no global install.
- `ffmpeg` + `ffprobe` on PATH, and `python3` for crossfades. Captions/title cards also need **ImageMagick** (`magick`): some ffmpeg builds ship without `drawtext`, so `compose.sh` renders text with ImageMagick and composites it via ffmpeg's `overlay`, which works everywhere. If anything is missing: `brew install ffmpeg imagemagick` (or your package manager's equivalent).
- **Attaching media needs only `gh` — no browser.** `publish-media.sh` pushes the files to a dedicated `docs/pr-<n>-<slug>-media` branch and prints commit-pinned URLs; you link them from the PR body. Private-repo safe: a `blob/<sha>/<file>?raw=true` (image/gif) embeds inline, and a `blob/<sha>/<file>` (video) opens GitHub's file-view **player** with play/pause/scrub — both work for anyone who can see the PR. Tradeoff vs. a drag-drop upload in the web UI: that mints a `.mp4` that autoplays **embedded in the body**; the gh link instead shows a GIF inline plus one click to the player page. So also publish a `.gif` (`compose.sh gif`) as the inline moving preview, with the `.mp4` player linked beside it. See step 5.
- **Scripts live in `scripts/` next to this file**: `record-flow.mjs` (recorder template), `compose.sh` (ffmpeg), `alloc-ports.mjs`, `publish-media.sh` (push media to a branch via gh → SHA-pinned URLs), `update-pr-body.mjs` (idempotent body splice). In the commands below, `$SKILL_DIR` is the absolute path of the directory containing this `SKILL.md` — wherever your agent installed it (e.g. `~/.claude/skills/pr-video` or `~/.codex/skills/pr-video`). Shell state usually doesn't persist between an agent's shell calls, so substitute the literal path or set `SKILL_DIR=…` at the start of each command.
- **Project-specific knowledge lives with the project, not in this skill**: which dev scripts to run, ports, auth bypass, seed data, env files, and which actions are unsafe locally. Check the repo's `AGENTS.md` / `CLAUDE.md` / README — and any project-specific companion skill — before step 2. When you learn something non-obvious while running this skill, suggest recording it there.
- Keep media out of the repo: default `--out` to `$TMPDIR/pr-media/<pr>/video`.
- **Desktop recording default:** use **1440×900**, keeping the full desktop layout. Use another viewport when the user requests it. Meet the destination's actual upload limit with compression or separate chapter videos, without silently switching to a narrow/mobile layout.

## Recording style — desktop scrolling and transitions

Use these defaults for PR and feature demos unless the user asks for a different style:

- Record **visible, gradual scrolling down and back up** each relevant page. Include the page bottom and return to the overview; pause at the important sections and before reversing direction.
- Pause **2–3 seconds** after meaningful actions and at readable checkpoints. `slowMo` alone does not make a large scroll jump gradual.
- Retain the actual scrolling and interaction frames. Trim idle setup time between segments; do not substitute a slideshow or animate a full-page screenshot to imitate a recording.
- Use **0.4-second crossfades between page/persona chapters**, preserving continuous motion within each chapter. A fade to black followed by a fade from black is a different effect.
- Keep dimensions consistent across actors and captures. Verify **1440×900 on every tab**; an embedded browser panel's current size is not the requested recording viewport. Restore temporary viewport overrides afterward.
- Export H.264 MP4 at **30 fps**, with readable captions. For multiple flows, provide a combined walkthrough with chapter times plus individual chapter videos. If asked to re-record all flows, capture each current flow again using the same settings.

Read [Desktop recording details](references/desktop-recording.md) when recording or composing a demo. It contains the scroll cadence, nested-scroll handling, actual-frame capture fallback and playback checks used for this style. Follow the active browser skill and its supported tools; the standalone recorder below applies only when that browser surface is permitted.

## 1. Understand the flow to record

From the PR, work out the **story**: who does what, in which app, in what order. A common multi-actor shape:
1. Customer acts in the customer-facing app.
2. Admin acts on it in the admin console.
3. Customer sees the result back in their app.

A single-actor flow is just one clip — skip what you don't need.

Read `gh pr view` / `gh pr diff` and the repo's existing e2e specs for real locators. Write down the exact clicks per actor **before** recording — then confirm the outline with the user if any step performs a write.

## 2. Run the servers (every app in the story)

Find the dev commands in the project docs or the `package.json` scripts.

**Allocate free ports first** so several stacks (or other sessions) can run at once — `alloc-ports.mjs` prefers a base and climbs if it's taken, which also avoids recording a **stale server** (dev servers and Playwright happily reuse whatever already holds the default port). Each shell call is a fresh shell, so **grab the numbers it prints and reuse those exact ports** everywhere below. For a two-app flow where each app has a web server and an API, allocate all four at once:

```bash
# → prints e.g. "3002 8787 3100 8888"  (CUSTOMER_WEB, CUSTOMER_API, ADMIN_WEB, ADMIN_API)
node "$SKILL_DIR/scripts/alloc-ports.mjs" --near 3000,8787,3100,8887
```

Launch each dev server in the background on its port, however the project takes one (`PORT=3002 npm run dev`, `npm run dev -- --port 3002`, a project-specific env var, …). Start shared backends first and point each app at the local one. Wait for every web port before recording:

```bash
until curl -sf http://127.0.0.1:3002 >/dev/null && curl -sf http://127.0.0.1:3100 >/dev/null; do sleep 1; done
```

Pass those web ports as `--customer-url` / `--admin-url` in step 3.

> **Fresh worktrees lack gitignored env files.** `.env.local`, `.dev.vars` and friends aren't checked in, so a page can render a "missing config / token" error while the nav shell still looks fine. Find which env file the app expects (copy it from the main checkout or create it per the project docs) and restart — before recording.

> **Teardown:** some dev servers respawn children (e.g. `wrangler dev` restarts `workerd`), so `pkill -9 -f "<worktree-path>/node_modules"` (kills one checkout's whole tree) rather than killing the port or the parent script.

> **Guardrail — writes can reach production.** Many apps default an API base URL to the **production** backend even under the dev script. A recorded flow performs real actions, so a "place order", "book a call" or "send invite" click can create a **real production record or send a real email**. Before recording any write path, confirm where the app's API calls go — point it at the local backend you launched, or confirm with the user that the action is safe to fire for real. Read-only walkthroughs are fine.

## 3. Record each actor

Recommended: the bundled **multi-context recorder**. Each persona records to its own `.webm`, which keeps the stitch clean and captionable. It's a template — **edit the `EDIT` region** with the real steps you wrote in step 1 (illustrative customer/admin steps are stubbed in). Use the web ports from step 2; in a monorepo point `--app-dir` at the package that has Playwright:

```bash
node "$SKILL_DIR/scripts/record-flow.mjs" \
  --app-dir "$(git rev-parse --show-toplevel)" \
  --customer-url http://127.0.0.1:3002 \
  --admin-url http://127.0.0.1:3100 \
  --out "${TMPDIR:-/tmp}/pr-media/$PR/video"
```

Edit a **copy** of the template (e.g. in the `--out` dir) rather than the installed skill file, so the next run starts clean. It prints `{clips:[{actor,file}]}` — one `.webm` per actor. The template defaults to 1440×900, provides a `gradualScroll` helper and uses 2.5-second reading pauses. Use the helper for deliberate down/up movement around the actual flow steps.

Alternative — **live screen capture** when the flow needs human-like judgement rather than a script: drive the app yourself with your agent's browser tool and capture with its recorder if it has one (e.g. Claude in Chrome's `gif_creator`), or record a screen region with ffmpeg avfoundation (`ffmpeg -f avfoundation -i "<screen>" out.mov` — macOS, needs Screen Recording permission). Prefer the scripted recorder when the flow is deterministic: it's reproducible and re-runnable after new commits.

## 4. Stitch & caption

Turn the raw clips into one captioned `.mp4` with `compose.sh` (normalize → label each segment → optional title card → crossfade; optional gif):

```bash
cd "${TMPDIR:-/tmp}/pr-media/$PR/video"
S="$SKILL_DIR/scripts/compose.sh"
"$S" mp4 1-customer/*.webm b.mp4 && "$S" label b.mp4 "1. Customer requests a refund" b1.mp4
"$S" mp4 2-admin/*.webm a.mp4 && "$S" label a.mp4 "2. Admin approves the request" a1.mp4
"$S" mp4 3-customer-after/*.webm c.mp4 && "$S" label c.mp4 "3. Customer sees it approved" c1.mp4
"$S" title "PR #$PR — refund approval flow" 2 1440x900 t.mp4
"$S" crossfade demo.mp4 t.mp4 b1.mp4 a1.mp4 c1.mp4
"$S" gif demo.mp4 demo.gif 960     # optional inline-autoplay preview
```

**Highlighting** — draw the viewer's eye to specific UI elements during key moments:

```bash
# circle a button at (640,400) in a 200×60 region, visible from 1s to 4s
"$S" highlight b1.mp4 b1h.mp4 640,400 200x60 1 4 circle

# arrow pointing down at (900,300), visible 2s–5s
"$S" highlight a1.mp4 a1h.mp4 900,300 0x0 2 5 arrow

# box around a card at (400,500), 300×200, visible 0s–3s
"$S" highlight c1.mp4 c1h.mp4 400,500 300x200 0 3 box
```

Coordinates are center `x,y`; size is `WxH` (for circle = axis diameters, for box = width×height; arrow ignores size). Shapes: `circle` (default), `arrow` (downward pointer), `box` (rounded rectangle). Chain multiple highlights by feeding the output of one as the input to the next. Apply highlights **after** `label` and **before** `crossfade`. The `concat` command remains available when hard cuts are explicitly desired.

`sidebyside left.mp4 right.mp4 out.mp4` is available if you'd rather show two personas at once. Watch `demo.mp4` before posting and check its size (`ls -lh demo.mp4`): GitHub rejects files over 100 MB in a push and warns above 50 MB — a PR demo should be far smaller.

## 5. Attach to the PR — with gh, no browser

Also make a GIF in step 4 (`compose.sh gif demo.mp4 demo.gif 960`): it's what shows *moving* in the body, since the MP4 link opens GitHub's player page rather than autoplaying embedded in the body.

Publish both to a dedicated media branch and link them. `publish-media.sh` writes the files as a parentless commit and force-pushes it to `docs/pr-<n>-<slug>-media` (a media-only branch — never your PR/code branch, and it leaves your checkout untouched), then prints the commit SHA and one URL per file:

```bash
"$SKILL_DIR/scripts/publish-media.sh" \
  "docs/pr-$PR-<slug>-media" \
  "${TMPDIR:-/tmp}/pr-media/$PR/video/demo.gif" \
  "${TMPDIR:-/tmp}/pr-media/$PR/video/demo.mp4"
# → sha=<40-hex>
#   demo.gif   https://github.com/<owner>/<repo>/blob/<sha>/demo.gif?raw=true   (embeds inline)
#   demo.mp4   https://github.com/<owner>/<repo>/blob/<sha>/demo.mp4            (opens GitHub's player)
```

`<slug>` is a short kebab describing the PR (e.g. `refund-approval` → `docs/pr-123-refund-approval-media`). Build `section.md` from the printed URLs — embed the GIF (it moves) as a clickable poster linking to the full MP4:

```markdown
## 🎥 Demo

[![Demo](GIF_URL)](MP4_URL)

▶ [Full walkthrough (MP4)](MP4_URL) — customer requests → admin approves → customer sees approval. Recorded locally.
```

If you only have the MP4 (no GIF), drop the image line and keep just the `▶ [Full walkthrough (MP4)](MP4_URL)` link. Then splice into the body (idempotent between `<!-- pr-demo:start/end -->`) — preview only:

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker demo --section-file section.md
```

> The MP4 link opens GitHub's player (controls) on its own file page — one click from the PR. A player embedded **directly in the PR body** (autoplaying inline, no click) is minted only by GitHub's web drag-drop upload; if the user wants that, hand them `demo.mp4` to drop into the description, or drive the upload with a browser-automation tool if your agent has one. The gh flow above is the no-browser default.

## 6. Confirm, then publish

Editing a PR description is public-content modification — **show the user the assembled body and the video, get an explicit yes**, then:

```bash
node "$SKILL_DIR/scripts/update-pr-body.mjs" \
  --marker demo --section-file section.md --write
```

Report the PR URL. Re-running the skill after new commits refreshes the `## 🎥 Demo` block in place.

## Guardrails

- **Confirm before firing write actions** in the recorded flow (production guardrail, step 2) and **before posting** to the PR (step 6). Both defaults are safe (preview / read-only).
- **The media branch is as visible as the repo.** On a public repo, anyone can see what you push there — watch the video for secrets, tokens, and real names/emails before step 5.
- **Local dev data only.** Don't record a deployed environment with real customer data; if you must, treat the frames as PII and stop to confirm.
- **Keep it small and short.** Trim to the essential steps; respect GitHub's file size limits; drop audio.
- Needs an existing PR — create one first (`gh pr create`) or ask if the branch has none.
