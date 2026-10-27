# Storyboard reference

## `public/showcase.json`

```json
{
  "brand": {
    "name": "Acme",
    "tagline": "Invoices that chase themselves.",
    "url": "acme.app",
    "logo": "logo.svg",
    "colors": { "paper": "#fcfcf9", "ink": "#1c1b15", "accent": "#fef1a1", "muted": "#626055", "stage": "#fcfcf9" },
    "shadow": "soft"
  },
  "style": "clean",
  "fps": 30,
  "music": "music/score.wav",
  "scenes": []
}
```

| Field | What it is |
|---|---|
| `brand.name`, `brand.tagline` | The intro's words. The tagline is one sentence. |
| `brand.url` | Shown in the window's address bar, and the outro's call to action unless the outro sets `cta`. |
| `brand.logo` | A file in `public/`, ideally an SVG. Shown in the intro and the outro. |
| `brand.colors.paper`, `.ink`, `.muted` | Light background, text, and secondary text: the product's own. |
| `brand.colors.accent` | The one brand colour: intro and outro backgrounds, marker strokes, and the screens' backdrop. |
| `brand.colors.stage` | Behind the window in screen scenes, if not the accent. Use `paper` when the app's own screens are mostly the accent colour, so the window stands out. |
| `brand.shadow` | The window's shadow: `soft` (default) or `hard`, an offset in ink, for flat, bordered brands. |
| `style` | The look: `clean` (default), `beams`, `aura` or `drafting`, from `src/styles/`. Step 4 of `SKILL.md` describes each, and [extending the template](extending.md) shows how to add one. |
| `chip` | The chapter chip over screens and stats (default `true`). |
| `fps` | Default 30. Use 60 for social posts if render time allows. |
| `sfx` | `true` plays a click on each click, a pop as each callout or lift lands, and a whoosh into each scene, from `public/sfx/`. |
| `beat` | `{ "bpm": 124, "offset": 0.337 }`, the music's tempo and its first beat in seconds, from `scripts/beats.mjs`: each cut after a title, stats or a quote moves by up to half a beat to land on one. |
| `music` | Optional, a file in `public/` (e.g. `music/score.wav`). It plays from 0:00 under the whole video, fading in over a second and out over the last two. See Music in `SKILL.md` for where to get it, where its drop should land and how loud it should be. |

Typefaces are code, not JSON: set them in `src/fonts.ts`. Any Google Font is one import line. For font files, use `@remotion/fonts`.

### Formats

| Composition | Size | For |
|---|---|---|
| `Showcase` | 1920×1080 | READMEs, sites, launch posts |
| `Showcase-9x16` | 1080×1920 | Reels, TikTok, Shorts |
| `Showcase-1x1` | 1080×1080 | feeds |

In 16:9 a screen plays the whole take in a window. In 9:16 and 1:1 each take is cut to a card around its action, which covers every zoom, every callout and every place the cursor goes, at the largest scale that fits. The camera rests there. It pushes in on a zoom only as far as the box still fits and the card still shows at least 600 CSS px of the page across, and eases back out on the click a push-in came for, to show what the click opens. It pans just far enough to keep the cursor's targets in sight. In a vertical frame, headlines and captions stay out of the top 170 px and the bottom 320 px, where a feed puts its own buttons and captions.

### Scenes

| `type` | Fields | Length |
|---|---|---|
| `intro` | `seconds` | 3 s |
| `title` | `text`, `kicker`, `theme`: `light` (paper), `dark` (ink) or `accent`; `seconds` | 2 s |
| `screen` | `take`, plus optional `title` (a headline above the window, which in 16:9 fades while the camera is pushed in), `frame` (what the take sits in, in 16:9: `browser`, the default; `card`; `phone`, for a take recorded at a phone's size; or `terminal`, for a command line in the browser), `from`, `to` (seconds, to use part of a take) | the take's length |
| `stats` | `items`: two to four `{ "value": "3", "label": "languages" }`. Values roll in digit by digit, and the last lands on an accent disc. | 3.2 s |
| `quote` | `text`, `by` (who said it), `theme` as for titles, `seconds`. A pull quote under a large quote mark: a customer, a review, or the claim the product answers. | 4 s |
| `compare` | `before` and `after`: two pictures of the same size in `public/`, such as screenshots or frames pulled from takes (`ffmpeg -ss <s> -i public/takes/<take>.mp4 -frames:v 1 public/after.png`); `labels` (default `["Before", "After"]`), `title`, `seconds`. The after wipes across the before, pausing halfway. | 4.5 s |
| `outro` | `text`, `cta` (defaults to `brand.url`), `seconds` | 4 s |

- In `text` and `title`, `*starred*` words are the accent: the serif's italic, over a marker stroke.
- Any scene can set `only`, the formats it plays in (default all). A hook that opens only the social cuts is `"only": ["9:16", "1:1"]`.
- Any scene can set `kicker`, its chapter ("02 · Sources"). On a title it sits above the text. A chip at the top of the frame carries it through the screens and stats after it, until the next kicker.
- Any scene can set `enter`, how it arrives over the last one:
  - `slide`: up from the bottom, the default for screens (except in `aura`, where they fade);
  - `fade`: the default for the rest;
  - `iris`: opens from the centre in a circle;
  - `clock`: sweeps in like a clock hand;
  - `push`: a push-cut with a flash;
  - `blocks`: drops in as a row of blocks, left to right (the `drafting` style's default for titles, stats and the outro).

  Use two or three kinds in one video, and save the showy ones for chapter breaks.
- Scenes overlap by 0.6 s, so every scene must be at least 1.2 s long.
- Two screen scenes can share one take through `from` and `to`, with a title scene between them.

## Takes

`record.mjs` writes `public/takes/<name>.mp4` and `<name>.json`:

```json
{
  "viewport": { "width": 1440, "height": 900 },
  "duration": 9.0,
  "events": [
    { "t": 1.4, "type": "zoom", "box": { "x": 513, "y": 488, "w": 670, "h": 80 }, "scale": 1.6 },
    { "t": 1.4, "type": "move", "from": [893, 648], "to": [848, 528], "dur": 1.16 },
    { "t": 2.56, "type": "click", "at": [848, 528] },
    { "t": 2.56, "type": "type", "until": 3.6 },
    { "t": 3.6, "type": "zoom" },
    { "t": 3.6, "type": "speed", "rate": 4, "until": 5.5 },
    { "t": 6.4, "type": "callout", "box": { "x": 512, "y": 147, "w": 638, "h": 256 }, "text": "He answers in Thai", "until": 9.0 },
    { "t": 6.5, "type": "say", "text": "He answers *in Thai.*" }
  ]
}
```

A `say` is a caption, from `t.say()`: it shows under the take from its time until the next one. A `lift`, from `t.lift()`, is `{ "t", "type": "lift", "box", "text", "until" }`: from `t` to `until`, the box rises out of the page into a floating card, with the rest dimmed behind it and `text` under it. A callout can be turned into a lift by editing its `type`.

In `record.mjs`, `t.top(locator, height)` turns a tall element (a long card, a whole reply) into a box for its top part. Zoom on that box and call it out, so the ring doesn't run off the frame.

Positions are CSS pixels in the recorded viewport, and times are seconds on the video's own clock, with sped-up spans already compressed. A `zoom` without a box goes back to the whole window. The JSON can be edited by hand to nudge a zoom, retime a callout or fix its wording, with no need to record again.

## Pacing and copy

- **30 to 60 seconds** in all: the intro, 3 or 4 moments, the outro. Titles of about 2 s, and takes of 6 to 12 s once sped up.
- **One idea per take.** Open on the state that sets it up, do the one thing, and hold the payoff for 2.5 to 3 s.
- **The camera** pushes in to 1.4–1.8× on what is being acted on or read, and pulls back out to show where it sits. Each move takes 1 s, so leave about a second between zooms. Zoom into the payoff so its text can be read.
- **Waits run under `t.fast()`**, at 3 to 6×, for model replies, loads and uploads. The badge says so.
- **Callouts**: at most one per take, of 6 words or fewer, on the thing that makes the moment worth showing.
- **A lift** is the strongest move: once a video, on its payoff, held about 3 s. Lift a whole element (a card, a reply, the full input with its button) so its edges come along.
- **Captions**: a `t.say()` for each beat of a take, 9 words or fewer, saying what the moment means rather than what the cursor does ("He answers from the *Pali Canon.*", not "The reply appears"). Leave about 2 s for each line to be read. A caption needn't repeat its take's callout.
- **Social cuts open on a hook**: a question the viewer has, or the payoff, in the first second. Never a logo: the brand comes at the end.
- **A stats beat** before the outro can land the claim: three numbers, the last one the punchline ("0 made-up quotes").
- **Copy**: in the product's own voice, concrete, and short. Titles of 6 words or fewer, with at most one accent each. Say what the viewer gets, not the feature's name: "Paid while you sleep", not "Automated reminders".
