---
name: showcase-demo
description: Make a polished, launch-style showcase video of a product, with motion graphics, from the running app. Real recordings of its best flows are staged in a browser window on the brand's colours, with kinetic titles, a camera that pushes in on each action, a drawn cursor, callouts, transitions, an intro and a call-to-action outro, rendered with Remotion. Use when the user asks for a showcase, demo, launch, promo or teaser video of their app or a feature, a product video "with motion graphics", a Screen Studio-style demo, or a hero video for a README, landing page, portfolio or social post. Records with Playwright (2× pixels plus a log of its clicks, typing and zooms), composes from a storyboard JSON, and delivers an MP4 and a GIF, optionally attached to a PR. For a reviewer's captioned walkthrough with before/after stills, use pr-video instead.
license: MIT
---

# Showcase Demo

Make the video you'd put on a landing page, at the top of a README or in a launch post: the product's best moments, recorded for real, staged with motion graphics in its own brand. `pr-video` records a PR so a reviewer can see it work; this one is made to show the product off.

The pipeline: **storyboard** (the copy and the scenes, in `showcase.json`) → **record** each flow as a take (`record.mjs`: 2× video plus an event log) → **compose** in Remotion (the bundled template turns each log into camera moves, a cursor and callouts) → **render** → **check** → **deliver**.

Confirm with the user before the storyboard is recorded (step 1), before any flow step that writes data (step 2), before the one-time Remotion install (step 0), and before anything is published (step 6).

## 0. Prerequisites

- **Node 18+, `ffmpeg`, and Playwright.** Playwright is resolved from `--app-dir`, normally the app's own copy. If the app has none, use any folder that has it, as `pr-video` does; with `--channel chrome` it records with the installed Google Chrome and downloads nothing.
- **Remotion** composes and renders. `studio.sh` installs it once into `~/.cache/showcase-demo` (about 300 MB of npm packages) and links it into every showcase, and the first render downloads Remotion's headless Chrome (about 90 MB). Ask before that first install. Remotion is free for individuals, non-profits and companies of up to 3 people; a larger company needs a [company license](https://www.remotion.pro/license), so say so when the user may be one.
- **Scripts live in `scripts/` next to this file**: `record.mjs` (the recorder template), `studio.sh` (makes the Remotion project), plus `alloc-ports.mjs`, `publish-media.sh` and `update-pr-body.mjs` shared with `pr-video`. The Remotion project's template is in `template/`. `$SKILL_DIR` below is the absolute path of the directory holding this `SKILL.md`; shell state doesn't persist between an agent's shell calls, so substitute the literal path or set it in each command.
- **Project knowledge lives with the project**: how to run it, ports, seed data, auth bypass, unsafe actions. Read the repo's `AGENTS.md` / `CLAUDE.md` / README first.

Each showcase gets its own folder, outside the repo:

```bash
SHOW="${TMPDIR:-/tmp}/showcase/<product>"
bash "$SKILL_DIR/scripts/studio.sh" "$SHOW"   # a Remotion project: src/ from the template, public/takes/
```

## 1. Storyboard

Read the product's own words first: README, landing page, docs, its welcome screen. Find its brand: colours (CSS variables, Tailwind theme), typefaces, logo (an SVG if there is one), live URL. Then pick **3 or 4 moments that sell it**: the payoffs a new user should see, not a tour of every feature.

Write `$SHOW/public/showcase.json`, put the logo in `$SHOW/public/`, and set the typefaces in `$SHOW/src/fonts.ts`:

```json
{
  "brand": {
    "name": "Acme", "tagline": "Invoices that chase themselves.", "url": "acme.app", "logo": "logo.svg",
    "colors": { "paper": "#fcfcf9", "ink": "#1c1b15", "accent": "#fef1a1", "muted": "#626055" }
  },
  "scenes": [
    { "type": "intro" },
    { "type": "title", "kicker": "Send", "text": "One click to *send.*" },
    { "type": "screen", "take": "send" },
    { "type": "screen", "take": "paid", "kicker": "Reminders", "title": "Paid while you *sleep.*" },
    { "type": "outro", "text": "Get paid *on time.*" }
  ]
}
```

Every field, the scene types, and the pacing and copy rules are in [the storyboard reference](references/storyboard.md). Read it before writing the storyboard.

Show the user the storyboard as a short script: each scene in order with its words, what each take does, and the estimated length (30 to 60 seconds). Get their OK before recording: the words are theirs to sign off.

## 2. Run the app

As in `pr-video`: start it as the project's docs say, on free ports (`node "$SKILL_DIR/scripts/alloc-ports.mjs" --near 3000,8787`), with its env files. Wait until it answers before recording.

- **Give it data that looks real**: the project's seed or demo data, with believable names. Never a real customer's data, and nothing private on screen.
- **Guardrail: writes can reach production.** Many apps point their dev build at a production API. A recorded flow really clicks "send" or "pay", so before recording any write, confirm where the app's API calls go, or get the user's OK to fire it for real.
- **A deployed site** is fine for public pages used as an anonymous visitor (a public demo, a marketing site), with the user's OK. Its calls are real ones: a chat app's replies cost real tokens.

## 3. Record the takes

One take per `screen` scene, named as its `take`. Copy the recorder next to the showcase and write the takes in its `EDIT` region with real locators (the app's e2e specs, or `getByRole` from its accessibility tree):

```js
await take("send", page, async (t) => {
  await t.hold(1000);                                                 // the starting state, to read
  await t.click(page.getByRole("button", { name: "New invoice" }), { zoom: true });
  await t.type("Northwind Traders");
  await t.fast(() => page.getByText("Sent").waitFor(), 4);            // a wait, played at 4× under a badge
  await t.zoomOut();
  await t.callout(page.getByRole("row").first(), "Sent and tracked");
  await t.hold(2500);                                                 // the payoff, held
});
```

`t` also has `press`, `zoom`, `scroll` and `hold`; the template's doc comment lists them all. Locators are measured when called, so zoom on and call out what's on screen at that moment. Then:

```bash
cp "$SKILL_DIR/scripts/record.mjs" "$SHOW/record.mjs"   # then write its EDIT region
node "$SHOW/record.mjs" --app-dir "<dir with playwright>" --url http://127.0.0.1:3000 \
  --out "$SHOW/public/takes" [--channel chrome] [--only send]
```

Each take becomes `public/takes/<name>.mp4` (2880×1800 for the default 1440×900 window, so the camera can push in without blur) and `<name>.json` (its events). `--only` re-records just the takes named.

Look at every take before composing: pull a frame from its payoff (`ffmpeg -ss <s> -i take.mp4 -frames:v 1 x.png`). The payoff must be on screen, with no error toast and no spinner. Read any generated text in it: model output glitches, so retake a garbled reply rather than ship it.

## 4. Compose and render

The template builds the video from the storyboard and the takes:
- **Intro**: the logo and name arrive, then the tagline.
- **Title** scenes: kinetic type, with a marker stroke under the *starred* words.
- **Screen** scenes: the take in a browser window. The camera glides to each zoom, a drawn cursor travels, presses and hides while typing, callouts ring their target, and a badge owns up to each sped-up stretch.
- **Outro**: the line and the call to action.

Scenes slide or fade into each other.

```bash
cd "$SHOW"
npx remotion studio                                  # optional: scrub it in the browser (localhost:3000)
npx remotion render Showcase out/showcase.mp4        # about 1–3 minutes for 40 seconds
npx remotion still Showcase out/poster.png --frame=60
ffmpeg -y -i out/showcase.mp4 -vf "fps=10,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" out/showcase.gif
```

Edit `public/showcase.json` and render again to change the words or the order. For a bespoke touch, edit `src/` directly: `scenes.tsx` has the look of each scene, `motion.ts` the camera and cursor, `Showcase.tsx` the timeline and transitions. Remotion animates only from `useCurrentFrame()`, never from CSS transitions; the `remotion-best-practices` skill, if installed, has the rest. The GIF is for a README, where a GIF plays inline: 40 seconds at 720 px and 10 fps comes to about 6 MB. Keep it under 10 MB.

## 5. Check before sharing

- `ffprobe out/showcase.mp4`: 1920×1080, H.264, the expected length. A minute should be well under 50 MB.
- Pull frames at each scene's middle, each transition, each callout and the last second, and look at them:
  - text is crisp and nothing is cut off;
  - each callout's label sits clear of its target;
  - the cursor is on the thing being clicked;
  - there are no blank frames and no stray dev overlays.
- Read every close-up of generated text in full.
- Nothing private on screen: no secrets, tokens, or real names and emails.

## 6. Deliver

Send the user the MP4, the GIF and the poster (their paths, or as files if your agent can send them), and say what each take shows and which were retaken. Then offer:

- **The README or the site**: copy the files into the repo's media folder (e.g. `docs/media/`) and embed the GIF linked to the MP4. That changes the repo, so ask first.
- **A PR**: as in `pr-video`, publish to a media branch, then splice a section into the PR body that embeds the GIF linked to the MP4 (`[![Showcase](GIF_URL)](MP4_URL)`, with the URLs it prints). Show the user the result before `--write`:

```bash
bash "$SKILL_DIR/scripts/publish-media.sh" "docs/pr-$PR-showcase-media" "$SHOW/out/showcase.gif" "$SHOW/out/showcase.mp4"
node "$SKILL_DIR/scripts/update-pr-body.mjs" --marker showcase --section-file section.md          # preview
node "$SKILL_DIR/scripts/update-pr-body.mjs" --marker showcase --section-file section.md --write  # after the user's yes
```

## Guardrails

- **Confirm** the storyboard before recording, writes before firing them, the Remotion install before running it, and anything published before publishing.
- **Show the real product.** Every frame of a take is the app as it ran. Speed-ups carry their badge. Never fake a UI state or edit what the app said; retake instead.
- **Local or demo data only**, or public pages of a deployed site as an anonymous visitor.
- **Keep it short**: 30 to 60 seconds and 3 or 4 moments, each held long enough to read.
