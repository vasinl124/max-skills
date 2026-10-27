---
name: showcase-demo
description: Make a polished, launch-style showcase video of a product, with motion graphics, from the running app. Real recordings of its best flows are staged in a browser window on the brand's colours, with kinetic titles, a camera that pushes in on each action, a drawn cursor, callouts, captions, transitions, an intro and a call-to-action outro, and an optional score, rendered with Remotion in 16:9, vertical 9:16 and square 1:1. Use when the user asks for a showcase, demo, launch, promo or teaser video of their app or a feature, a product video "with motion graphics", a Screen Studio-style demo, a hero video for a README, landing page or portfolio, or a vertical or square cut for Reels, TikTok, Shorts or a feed. Records with Playwright (2× pixels plus a log of its clicks, typing and zooms), composes from a storyboard JSON, and delivers an MP4 and a GIF, optionally attached to a PR. For a reviewer's captioned walkthrough with before/after stills, use pr-video instead.
license: MIT
---

# Showcase Demo

Make the video you'd put on a landing page, at the top of a README or in a launch post: the product's best moments, recorded for real, staged with motion graphics in its own brand. One storyboard renders the 16:9 hero and the vertical and square cuts for social feeds. `pr-video` records a PR so a reviewer can see it work; this one is made to show the product off.

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

**Cuts for social feeds** (9:16 for Reels, TikTok and Shorts, 1:1 for feeds) come from the same storyboard. They play muted, in a feed the viewer is scrolling past, so:
- **Hook first.** Open on a title that asks the viewer's question or promises the payoff ("What would you ask *the Buddha?*"), and keep the logo for the end. A scene's `only` keeps it to some formats: give the intro `"only": ["16:9"]` and the hook `"only": ["9:16", "1:1"]`.
- **Narrate with captions**: a `t.say()` line for each beat of a take (step 3).
- **Name the chapters**: a scene's `kicker` ("02 · Sources") rides on a chip through the screens after it.

Show the user the storyboard as a short script: each scene in order with its words, what each take does, the style you'd pick for the brand (step 4 lists them), and the estimated length (30 to 60 seconds). Get their OK before recording: the words are theirs to sign off.

## 2. Run the app

As in `pr-video`: start it as the project's docs say, on free ports (`node "$SKILL_DIR/scripts/alloc-ports.mjs" --near 3000,8787`), with its env files. Wait until it answers before recording.

- **Give it data that looks real**: the project's seed or demo data, with believable names. Never a real customer's data, and nothing private on screen.
- **Guardrail: writes can reach production.** Many apps point their dev build at a production API. A recorded flow really clicks "send" or "pay", so before recording any write, confirm where the app's API calls go, or get the user's OK to fire it for real.
- **A deployed site** is fine for public pages used as an anonymous visitor (a public demo, a marketing site), with the user's OK. Its calls are real ones: a chat app's replies cost real tokens.

## 3. Record the takes

One take per `screen` scene, named as its `take`. Copy the recorder next to the showcase and write the takes in its `EDIT` region with real locators (the app's e2e specs, or `getByRole` from its accessibility tree):

```js
await take("send", page, async (t) => {
  await t.say("Bill a client in *one click.*");                       // a caption, until the next one
  await t.hold(1000);                                                 // the starting state, to read
  await t.click(page.getByRole("button", { name: "New invoice" }), { zoom: true });
  await t.type("Northwind Traders");
  await t.fast(() => page.getByText("Sent").waitFor(), 4);            // a wait, played at 4× under a badge
  await t.zoomOut();
  await t.say("Then it *chases the payment.*");
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

Each take becomes `public/takes/<name>.mp4` (2880×1800 for the default 1440×900 window, so the camera can push in without blur) and `<name>.json` (its events). `--only` re-records just the takes named. If a take builds on the state an earlier one leaves behind (a sent message, an open panel), re-record them together.

A vertical or square cut reuses these takes, cut to a card around their action. When the text in a take must be read on a phone, record it again at a phone's size (`--size 430x932 --scale 3`) under its own name, and give it a screen scene with `"only": ["9:16"]`.

Look at every take before composing: pull a frame from its payoff (`ffmpeg -ss <s> -i take.mp4 -frames:v 1 x.png`). The payoff must be on screen, with no error toast and no spinner. Read any generated text in it: model output glitches, so retake a garbled reply rather than ship it.

## 4. Compose and render

The template builds the video from the storyboard and the takes:
- **Intro**: the logo and name arrive, then the tagline.
- **Title** scenes: kinetic type, with a marker stroke under the *starred* words.
- **Screen** scenes: the take in a browser window, or in 9:16 and 1:1 a card cut to its action. The camera glides to each zoom, a drawn cursor travels, presses and hides while typing, callouts ring their target, captions narrate underneath, and a badge owns up to each sped-up stretch. A chip at the top names the chapter.
- **Stats** scenes: two to four numbers that roll in like a counter, the last landing on an accent disc.
- **Outro**: the line and the call to action.

Screens slide up into place, and other scenes fade in. A scene's `enter` can instead open it in an iris, sweep it in with a clock wipe, or push-cut to it.

```bash
cd "$SHOW"
npx remotion studio                                  # optional: scrub it in the browser (localhost:3000)
npx remotion render Showcase out/showcase.mp4        # 16:9, about 1–3 minutes for 40 seconds
npx remotion render Showcase-9x16 out/vertical.mp4   # 1080×1920, for Reels, TikTok and Shorts
npx remotion render Showcase-1x1 out/square.mp4      # 1080×1080, for feeds
npx remotion still Showcase out/poster.png --frame=60
ffmpeg -y -i out/showcase.mp4 -vf "fps=10,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" out/showcase.gif
```

Edit `public/showcase.json` and render again to change the words or the order.

`"style"` picks the look. Each one takes its colours from the brand:

| Style | The look | Suits |
|---|---|---|
| `clean` (default) | Flat brand colours under a drifting light. | Anything; the safe choice. |
| `rays` | Dark, lit from above by slow beams of the accent with the odd sparkle. Starred words glow, and so do windows. | Bold launches, developer tools, anything that looks good after dark. |
| `aura` | Soft orbs of the accent and its neighbouring hues breathing over the ground. The chip and captions sit on frosted glass, and screens fade in. | Calm, consumer and wellness products. |
| `drafting` | Grid paper with registration marks and a wandering crosshair (a blueprint on dark). Mono labels, leader-line callouts, and titles that drop in as blocks. | Engineering, data and productivity tools. |

`npx remotion render Sampler out/sampler.mp4` plays every style side by side in the storyboard's brand, including a slice of a take, so the user can pick one. For a bespoke touch, edit `src/` directly: `scenes/` draws each scene, `styles/` holds the looks, `frames.tsx` the window, `formats.ts` the sizes, `motion.ts` the camera and cursor, and `Showcase.tsx` the timeline and transitions. To add a style, a kind of scene, a frame or a format that works in every format, follow [extending the template](references/extending.md). Remotion animates only from `useCurrentFrame()`, never from CSS transitions; the `remotion-best-practices` skill, if installed, has the rest. The GIF is for a README, where a GIF plays inline: 40 seconds at 720 px and 10 fps comes to about 6 MB. Keep it under 10 MB.

### Music

A README GIF is silent anyway, but a score lifts the video on a site or in a social post. Use only music the user has the rights to, and say where it came from:
- **Their own track**, licensed for video.
- **Suno**, on a paid plan. An agent can generate the track, but only the user can save it: Suno signs its file links and encrypts its stream, and a browser driven by an agent doesn't save Suno's downloads. Ask the user to click ⋯ → Download → WAV, and pick the file up from `~/Downloads`.
- **A music model the user has connected** (ElevenLabs Music, Lyria and the like), whose files download directly. Check the cost and tell the user before generating. Put the edit's timings in the prompt: a quiet open under the intro, where the beat should drop, any breaks, the final hit, and a fade by the end.

Put the file in `public/music/` and set `"music": "music/<file>"` in `showcase.json`. It plays from 0:00, fading in over a second and out over the last two. Then:
- **Find its drop** from its loudness each second (`ffmpeg -i <file> -af "aresample=8000,asetnsamples=8000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level" -f null -`). Line the drop up with a moment that earns it, such as the first action or a sent question, trimming the file's start if it needs to move.
- **Set its level with a fixed gain.** Measure its integrated loudness (`ffmpeg -i <file> -af ebur128 -f null -`), then apply `volume=<−14 minus that>dB` to land at −14 LUFS, which is about −16 LUFS in the video. Avoid `loudnorm`'s default mode: it lifts a quiet intro to the drop's level.
- **Check the plan's terms.** Generated music usually comes under them: paid-plan output is typically fine as a video's soundtrack, but not as a track released on its own. Tell the user what they allow.

## 5. Check before sharing

- `ffprobe` each file: 1920×1080 (1080×1920 vertical, 1080×1080 square), H.264, the expected length. A minute should be well under 50 MB.
- Pull frames at each scene's middle, each transition, each callout and the last second, and look at them:
  - text is crisp and nothing is cut off, including at the edges of a vertical or square cut's card;
  - each callout's label sits clear of its target;
  - the cursor is on the thing being clicked;
  - there are no blank frames and no stray dev overlays.
- Read every close-up of generated text in full.
- Nothing private on screen: no secrets, tokens, or real names and emails.

## 6. Deliver

Send the user the MP4s, the GIF and the poster (their paths, or as files if your agent can send them), and say what each take shows and which were retaken. Then offer:

- **The README or the site**: copy the files into the repo's media folder (e.g. `docs/media/`) and embed the GIF linked to the MP4. On a site, use a `<video controls playsInline preload="none" poster>` with the MP4 and the poster, and play it in the deployment preview before merging. Either way that changes the repo, so ask first.
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
