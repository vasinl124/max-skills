#!/usr/bin/env node
/**
 * record-flow.mjs — record a multi-actor demo of a PR flow with Playwright.
 *
 * This is a TEMPLATE. Each actor gets its own browser context and its own video
 * file, so a "customer does X → admin does Y → customer sees result" narrative records
 * cleanly as separate clips you can caption and stitch (see compose.sh). Edit the
 * region marked `EDIT` with the real steps for the PR under test.
 *
 * Playwright is resolved from the target app's node_modules (--app-dir), so no
 * global install is needed and the app's own browser binary is reused.
 *
 * Usage:
 *   node record-flow.mjs \
 *     --app-dir  /path/to/app \
 *     --customer-url http://127.0.0.1:5173 \
 *     --admin-url http://127.0.0.1:5174 \
 *     --out      /tmp/pr-media/123/video \
 *     [--size 1440x900] [--headed]
 *
 * Prints JSON {clips:[{actor,file}...]} — feed the files to compose.sh.
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(`--${name}`);

const appDir = resolve(arg("app-dir", process.cwd()));
const customerURL = arg("customer-url", "http://127.0.0.1:5173");
const adminURL = arg("admin-url", "http://127.0.0.1:5174");
const outDir = resolve(arg("out", join(process.cwd(), "pr-media", "video")));
const [W, H] = (arg("size", "1440x900")).split("x").map(Number);
const headed = flag("headed");

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
  throw new Error(`Could not resolve Playwright from ${dir}; pass --app-dir to the app package.`);
}

const chromium = loadChromium(appDir);
await mkdir(outDir, { recursive: true });
// Reading pauses and gradual wheel steps below control the pace explicitly.
const browser = await chromium.launch({ headless: !headed, slowMo: 80 });
const clips = [];

/** Open a recorded actor. Call `await a.finish()` to flush and get the .webm path. */
async function actor(name, url) {
  const dir = join(outDir, name);
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  if (url) await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  return {
    page,
    async finish() {
      const video = page.video();
      await context.close(); // video is finalized on context close
      const file = video ? await video.path() : null;
      if (file) clips.push({ actor: name, file });
      return file;
    },
  };
}

// Small helpers you'll reuse in the steps below.
const pause = (page, ms = 2500) => page.waitForTimeout(ms);
async function gradualScroll(page, { direction = "down", distance = 600, point } = {}) {
  if (!["down", "up"].includes(direction) || !Number.isFinite(distance) || distance < 0) {
    throw new Error("gradualScroll requires up/down and a finite non-negative distance.");
  }
  const size = page.viewportSize();
  if (!point && !size) throw new Error("Provide a scroll point when the viewport is unknown.");
  // Override point to target the observed page scroller, avoiding nested panels.
  const target = point ?? { x: size.width * 0.22, y: size.height * 0.7 };
  await page.mouse.move(target.x, target.y);
  const sign = direction === "down" ? 1 : -1;
  for (let remaining = distance; remaining > 0;) {
    const step = Math.min(24, remaining);
    await page.mouse.wheel(0, sign * step);
    await page.waitForTimeout(20);
    remaining -= step;
  }
}

// ─────────────────────────── EDIT: the narrative ───────────────────────────
// Replace the illustrative steps with the real flow this PR demonstrates. Use
// getByRole/getByText locators (see the repo's existing e2e specs for patterns).
// Record down/up scrolling around the steps, pausing at readable checkpoints.
// Use observed scroll bounds to choose distance and verify bottom/top coverage:
// await gradualScroll(customer.page, { direction: "down", distance: 600 });
// await pause(customer.page);
// await gradualScroll(customer.page, { direction: "up", distance: 600 });

// 1) Customer does something in the customer-facing app.
const customer = await actor("1-customer", customerURL);
// await customer.page.getByRole("button", { name: /request refund/i }).click();
// await customer.page.getByRole("dialog").waitFor();
await pause(customer.page);
await customer.finish();

// 2) Admin acts on it in the admin console.
const admin = await actor("2-admin", adminURL);
// await admin.page.getByRole("link", { name: /requests/i }).click();
// await admin.page.getByRole("button", { name: /approve/i }).click();
await pause(admin.page);
await admin.finish();

// 3) Customer sees the result.
const customerAfter = await actor("3-customer-after", customerURL);
await pause(customerAfter.page);
await customerAfter.finish();
// ─────────────────────────── END EDIT ───────────────────────────

await browser.close();
console.log(JSON.stringify({ outDir, clips }, null, 2));
