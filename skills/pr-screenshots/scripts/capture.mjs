#!/usr/bin/env node
/**
 * capture.mjs — screenshot a list of routes at one or more viewports, using the
 * TARGET APP's own Playwright install (resolved from --app-dir), so no global
 * playwright is required and the browser binary the app already downloaded is
 * reused.
 *
 * Usage:
 *   node capture.mjs \
 *     --app-dir  /path/to/app        # a dir whose node_modules has @playwright/test
 *     --base-url http://127.0.0.1:5173 \
 *     --routes   "/,/settings/billing,/#pricing" \
 *     --out      /tmp/pr-media/123/screenshots \
 *     [--viewports "desktop:1440x900,mobile:390x844"]  # default: both
 *     [--wait 1500]          # settle ms after load (default 1200)
 *     [--dismiss-overlay]    # scroll once first, for apps with a scroll-dismissed intro overlay
 *     [--no-full-page]       # viewport-only shots (default is full page)
 *     [--channel chrome]     # use your installed Chrome instead of Playwright's downloaded browser
 *     [--headed]             # watch it run
 *
 * Prints a JSON manifest {shots:[{route,viewport,file,ok,error?}]} to stdout.
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
const baseURL = arg("base-url");
const routes = (arg("routes", "/") || "/").split(",").map((s) => s.trim()).filter(Boolean);
const outDir = resolve(arg("out", join(process.cwd(), "pr-media", "screenshots")));
const settle = Number(arg("wait", "1200"));
const fullPage = !flag("no-full-page");
const dismissOverlay = flag("dismiss-overlay");
const headed = flag("headed");
const channel = arg("channel");
const viewports = (arg("viewports", "desktop:1440x900,mobile:390x844"))
  .split(",")
  .map((v) => {
    const [name, dims] = v.split(":");
    const [w, h] = dims.split("x").map(Number);
    return { name, width: w, height: h, isMobile: w < 768 };
  });

if (!baseURL) {
  console.error("error: --base-url is required");
  process.exit(2);
}

// Resolve Playwright's chromium from the app's node_modules (walks up from appDir).
function loadChromium(dir) {
  const req = createRequire(join(dir, "__resolver__.js"));
  for (const pkg of ["@playwright/test", "playwright", "playwright-core"]) {
    try {
      const m = req(pkg);
      if (m?.chromium) return m.chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `Could not resolve Playwright from ${dir}. Pass --app-dir to a package whose ` +
      `node_modules contains @playwright/test.`,
  );
}

const slug = (route) =>
  route.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
  "root";

const chromium = loadChromium(appDir);
await mkdir(outDir, { recursive: true });
const browser = await chromium
  .launch({ headless: !headed, ...(channel ? { channel } : {}) })
  .catch((error) => {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    // Playwright is installed but its browser build isn't downloaded — the usual first-run snag.
    console.error(
      `error: Playwright in ${appDir} has no downloaded browser. Either:\n` +
        `  1. (cd "${appDir}" && npx playwright install chromium)\n` +
        `  2. re-run with --channel chrome to use your installed Google Chrome`,
    );
    process.exit(3);
  });
const manifest = { baseURL, outDir, shots: [] };

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 2 : 1,
  });
  const page = await context.newPage();
  for (const route of routes) {
    const url = route.startsWith("http") ? route : baseURL.replace(/\/$/, "") + route;
    const file = join(outDir, `${slug(route)}--${vp.name}.png`);
    try {
      await page
        .goto(url, { waitUntil: "networkidle", timeout: 45000 })
        .catch(() => page.goto(url, { waitUntil: "load", timeout: 45000 }));
      if (dismissOverlay) {
        const size = page.viewportSize();
        if (size) await page.mouse.move(size.width / 2, size.height / 2);
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(settle);
      await page.screenshot({ path: file, fullPage });
      manifest.shots.push({ route, viewport: vp.name, file, ok: true });
    } catch (error) {
      manifest.shots.push({ route, viewport: vp.name, file, ok: false, error: String(error) });
    }
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify(manifest, null, 2));
