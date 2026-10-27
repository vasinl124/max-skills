#!/usr/bin/env node
/**
 * record.mjs — record the takes of a product showcase: sharp video of each flow (2× pixels, so the
 * camera can push in without blur) plus a log of what happened when (cursor moves, clicks, typing,
 * zoom targets, callouts, sped-up waits), which the Remotion template turns into camera moves, a
 * drawn cursor and callouts.
 *
 * This is a TEMPLATE: copy it next to the showcase and write the takes in the EDIT region.
 * Playwright is resolved from --app-dir (the app's own copy, so nothing global), and Chrome's
 * screencast captures every repaint with its real timing. Needs ffmpeg.
 *
 * Usage:
 *   node record.mjs --app-dir <dir with playwright> --url http://127.0.0.1:3000 \
 *     --out <showcase>/public/takes [--only ask,sources] [--size 1440x900] [--scale 2] \
 *     [--channel chrome] [--headed]
 *
 * Writes <out>/<take>.mp4 and <out>/<take>.json for each take; --only re-records just those. Steps
 * outside the named takes still run, but a skipped take's own steps don't: if a take builds on the state
 * an earlier one leaves (a sent message, an opened panel), re-record them together.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const appDir = resolve(arg("app-dir", process.cwd()));
const baseURL = arg("url", "http://127.0.0.1:3000");
const outDir = resolve(arg("out", "public/takes"));
const [W, H] = arg("size", "1440x900").split("x").map(Number);
const SCALE = Number(arg("scale", "2"));
const only = arg("only")?.split(",");
const channel = arg("channel");
const FPS = 30;
// Overlays to keep out of the frame: Next.js's dev badge here. Add your framework's, and the app's own
// floating chrome that would distract (a scroll-to-bottom button, a cookie banner, a chat widget).
const HIDE = "nextjs-portal { display: none !important; }";

function loadChromium(dir) {
  const req = createRequire(join(dir, "__resolver__.js"));
  for (const pkg of ["@playwright/test", "playwright", "playwright-core"]) {
    try {
      const m = req(pkg);
      if (m?.chromium) return m.chromium;
    } catch {
      /* next */
    }
  }
  throw new Error(`Could not resolve Playwright from ${dir}; pass --app-dir to a folder that has it.`);
}

const chromium = loadChromium(appDir);
mkdirSync(outDir, { recursive: true });
// The flag makes the screencast itself 2×: the context's deviceScaleFactor alone only reaches screenshots.
const browser = await chromium
  .launch({ headless: !process.argv.includes("--headed"), args: [`--force-device-scale-factor=${SCALE}`], ...(channel ? { channel } : {}) })
  .catch((error) => {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    console.error(
      `error: Playwright in ${appDir} has no downloaded browser. Either:\n` +
        `  1. (cd "${appDir}" && npx playwright install chromium)\n` +
        `  2. re-run with --channel chrome to use your installed Google Chrome`,
    );
    process.exit(3);
  });

/** A fresh page at the showcase's size and 2× pixels, with HIDE applied to every document it loads. */
async function open(url = baseURL, contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, ...contextOptions });
  await context.addInitScript((css) => {
    addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: css })));
  }, HIDE);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  return page;
}

// The drawn cursor's path (along() in template/src/motion.ts): the real mouse follows it, so hover
// states land as the drawn cursor passes.
function along(from, to, p) {
  const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60, len * 0.12) * Math.sin(Math.PI * e);
  return [from[0] + dx * e - (dy / len) * bend, from[1] + dy * e + (dx / len) * bend];
}

// A visible scroll in small wheel steps. Aim `point` at the element that actually scrolls.
async function gradualScroll(page, { direction = "down", distance = 600, point } = {}) {
  const target = point ?? { x: W * 0.5, y: H * 0.6 };
  await page.mouse.move(target.x, target.y);
  const sign = direction === "down" ? 1 : -1;
  for (let left = distance; left > 0; left -= 24) {
    await page.mouse.wheel(0, sign * Math.min(24, left));
    await page.waitForTimeout(20);
  }
}

const cursors = new WeakMap(); // each page's cursor position, carried from take to take

/**
 * Records one take of `page`: everything `steps` does, as <out>/<name>.mp4 (real time, except the
 * spans run under t.fast()) and <out>/<name>.json (the events, on the video's clock). `steps` gets t:
 *   t.click(locator, { zoom })   glide the cursor over and click; zoom: true (frame it) or a scale
 *   t.type(text)                 type into the focused field; the cursor hides while typing
 *   t.press(key)                 press a key, e.g. "Enter"
 *   t.zoom(locator, { scale })   push the camera in on it (by default it fills up to 70% of the frame)
 *   t.zoomOut()                  pull the camera back to the whole window
 *   t.callout(locator, text)     ring it with a label for `hold` seconds (default 2.5)
 *   t.lift(locator, text)        lift it out of the page into a floating card, with the rest dimmed
 *                                behind it and an optional line under it, for `hold` seconds (default 3)
 *   t.fast(async () => …, rate)  play this span `rate`× faster (default 4): waiting for a reply, a load
 *   t.scroll({ distance, direction, point })   a gradual, visible scroll
 *   t.say(text)                  a caption under the take from now until the next one: what this beat
 *                                means, in 9 words or fewer; *starred* words take the accent
 *   t.hold(ms)                   give the viewer time to read (default 1500)
 *   t.top(locator, height)       a box for just the top of a tall element (default 380 px), to zoom
 *                                on or call out where it starts instead of ringing it off the frame
 * Locators are measured when called, so zoom or call out what is on screen at that moment; any
 * target can also be a plain { x, y, w, h } box.
 */
async function take(name, page, steps) {
  if (only && !only.includes(name)) return;
  const dir = mkdtempSync(join(tmpdir(), `take-${name}-`));
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const events = [];
  const fast = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, at: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * SCALE, maxHeight: H * SCALE });
  const now = () => Date.now() / 1000;
  const log = (e) => events.push({ t: now(), ...e });
  const box = async (target) => {
    if (!target.boundingBox) return target; // already {x, y, w, h}
    await target.waitFor();
    const b = await target.boundingBox();
    if (!b) throw new Error(`take ${name}: not on screen: ${target}`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  let mouse = cursors.get(page) ?? [W * 0.62, H * 0.72];
  const t = {
    page,
    async click(target, { zoom, travel = 0.8 } = {}) {
      const b = await box(target);
      if (zoom) await t.zoom(b, zoom === true ? {} : { scale: zoom });
      const to = [b.x + b.w / 2, b.y + b.h / 2];
      const start = now();
      const n = Math.round(travel * 30);
      for (let i = 1; i <= n; i++) {
        await page.mouse.move(...along(mouse, to, i / n));
        await page.waitForTimeout((travel * 1000) / n);
      }
      events.push({ t: start, type: "move", from: mouse, to, dur: now() - start }); // as long as it really took
      mouse = to;
      log({ type: "click", at: to });
      await page.mouse.click(...to);
    },
    async type(text, { delay = 55 } = {}) {
      const start = now();
      await page.keyboard.type(text, { delay });
      events.push({ t: start, type: "type", until: now() });
    },
    press: (key) => page.keyboard.press(key),
    async zoom(target, { scale } = {}) {
      log({ type: "zoom", box: await box(target), ...(scale && { scale }) });
    },
    async zoomOut() {
      log({ type: "zoom" });
    },
    async callout(target, text, { hold = 2.5 } = {}) {
      log({ type: "callout", box: await box(target), text, until: now() + hold });
      await page.waitForTimeout(hold * 1000);
    },
    async lift(target, text, { hold = 3 } = {}) {
      log({ type: "lift", box: await box(target), ...(text && { text }), until: now() + hold });
      await page.waitForTimeout(hold * 1000);
    },
    async fast(fn, rate = 4) {
      const from = now();
      const result = await fn();
      fast.push({ from, to: now(), rate });
      return result;
    },
    async say(text) {
      log({ type: "say", text });
    },
    scroll: (options) => gradualScroll(page, options),
    hold: (ms = 1500) => page.waitForTimeout(ms),
    async top(target, height = 380) {
      const b = await box(target);
      return { ...b, h: Math.min(b.h, height) };
    },
  };
  await page.waitForTimeout(400); // a first frame before anything moves
  await steps(t);
  await page.waitForTimeout(300);
  await cdp.send("Page.stopScreencast");
  const end = now();
  await cdp.detach();
  cursors.set(page, mouse);
  if (!frames.length) throw new Error(`take ${name}: no frames recorded`);

  // The video's clock: real time since the first frame, less what each sped-up span saves.
  const zero = frames[0].at;
  const clock = (s) => Math.max(0, fast.reduce((c, f) => c - Math.max(0, Math.min(s, f.to) - f.from) * (1 - 1 / f.rate), s - zero));
  const at = (s) => +clock(s).toFixed(3);
  const duration = at(end);
  // Each frame lasts until the next. The concat demuxer needs the last file listed twice, and -t
  // stops the video where the take ended, so it can't outrun its event log.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${(clock(frames[i + 1]?.at ?? end) - clock(f.at)).toFixed(4)}`);
  writeFileSync(join(dir, "frames.txt"), [...list, `file '${frames.at(-1).file}'`].join("\n"));
  const video = join(outDir, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "frames.txt"),
    "-vf", `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-t", String(duration),
    "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart", "-an", video,
  ]);
  rmSync(dir, { recursive: true });

  const timeline = [
    ...events.map(({ t: s, until, ...e }) => ({ t: at(s), ...e, ...(until && { until: at(until) }) })),
    ...fast.map((f) => ({ t: at(f.from), type: "speed", rate: f.rate, until: at(f.to) })),
  ].sort((a, b) => a.t - b.t);
  const json = { viewport: { width: W, height: H }, duration, events: timeline };
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(json, null, 2));
  console.log(`wrote ${video} (${json.duration.toFixed(1)} s from ${frames.length} frames) and ${name}.json`);
}

// ─────────────────────────── EDIT: the takes ───────────────────────────
// One take per screen scene of the storyboard, named as the scene's `take`. Use real locators: the
// app's e2e specs, or getByRole/getByText from its accessibility tree. A take is one idea, 5 to 15
// seconds once sped up: open on the state that sets it up, act, hold on the payoff.
const page = await open();
await take("hero", page, async (t) => {
  await t.hold(1200);
  // await t.click(page.getByRole("textbox", { name: /search/i }), { zoom: true });
  // await t.type("running shoes");
  // await t.press("Enter");
  // await t.fast(() => page.getByRole("list", { name: /results/i }).waitFor(), 4);
  // await t.zoomOut();
  // await t.callout(page.getByRole("listitem").first(), "Results as you type");
  await t.hold(1500);
});
await page.context().close();
// ─────────────────────────── END EDIT ───────────────────────────

await browser.close();
