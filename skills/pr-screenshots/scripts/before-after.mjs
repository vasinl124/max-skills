#!/usr/bin/env node
/**
 * before-after.mjs — capture the same screens on the base branch (BEFORE) and the PR (AFTER), box what changed
 * in red with short labels, and join each pair side by side. The browser draws everything (boxes, labels,
 * the side-by-side composite and the optional numbers card), so this needs only Playwright — no ImageMagick.
 *
 * Playwright is resolved from --app-dir, exactly like capture.mjs.
 *
 * Usage:
 *   node before-after.mjs \
 *     --app-dir    /path/to/app                # a dir whose node_modules has Playwright
 *     --before-url http://127.0.0.1:3001        # the base branch, on the same data
 *     --after-url  http://127.0.0.1:3002        # the PR head, on the same data
 *     --scenes     scenes.json                  # the pairs to capture (format below)
 *     --out        /tmp/pr-media/123/before-after \
 *     [--card card.json] [--card-title "PR #123, before and after"]   # numbers measured on both sides
 *     [--before-label "BEFORE  main"] [--after-label "AFTER  PR #123"] [--accent "#1a7f37"]
 *     [--viewport 1440x900] [--scale 2] [--wait 800] [--channel chrome] [--headed]
 *
 * scenes.json — an array; each scene is one BEFORE | AFTER pair:
 *   {
 *     "name": "billing",                        file slug
 *     "title": "Settings · Billing",            heading above the pair
 *     "path": "/settings/billing",              opened on both sides (beforePath / afterPath when a route moved)
 *     "steps": [STEP...],                       run on both sides after load
 *     "beforeSteps": [], "afterSteps": [],      extra steps for one side, run after "steps"
 *     "before": [BOX...], "after": [BOX...]     what to box on each side
 *   }
 *   STEP: {"waitFor": sel} | {"click": sel} | {"open": "details sel"} | {"wait": ms} | {"eval": "js statements"}
 *         | {"scrollTo": sel, "offset": 16}     scrolls the element's own scroll container (a pane, or the page)
 *                                             so the element sits `offset` px below its top
 *   BOX:  {"sel": "css", "label": "NEW  Pay range",
 *          "text": "Pay",        keep only elements whose text is exactly this (else: contains it)
 *          "all": true,          box the union of every match instead of the first
 *          "withNext": true,     add each match's next sibling (dt + dd, label + value)
 *          "tight": true,        measure the text itself, not the full-width block
 *          "pad": 6,
 *          "at": "above" | "below" | "right" (inside, top-right) | "after" (outside, right) | "before" | "inside"}
 *   The label goes to the requested spot unless that covers text; then to whichever spot covers the least.
 *
 * card.json — [{"label": "New postings found", "before": "70", "after": "813", "note": "same moment"}]
 *   Use "section": "Finding jobs" on a row to start a titled group.
 *
 * Prints {outDir, pairs:[{name, file, before, after, missing:{before, after}, moved:{before, after}}], card?}.
 * `missing` lists boxes whose element wasn't found or was off screen: fix the scene and re-run.
 * `moved` lists labels that could not go where `at` asked (too long to fit, or it would cover text):
 * look at those, and shorten the label or pick another spot if the new place reads badly.
 * A double space in --before-label/--after-label splits it: "BEFORE  main" renders "main" as a lighter subtitle.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(`--${name}`);

const appDir = resolve(arg("app-dir", process.cwd()));
const beforeURL = arg("before-url");
const afterURL = arg("after-url");
const scenesFile = arg("scenes");
const cardFile = arg("card");
const outDir = resolve(arg("out", join(process.cwd(), "pr-media", "before-after")));
const [W, H] = arg("viewport", "1440x900").split("x").map(Number);
const scale = Number(arg("scale", "2"));
const settle = Number(arg("wait", "800"));
const channel = arg("channel");
const headed = flag("headed");
const beforeLabel = arg("before-label", "BEFORE");
const afterLabel = arg("after-label", "AFTER");
const accent = arg("accent", "#1a7f37");
const cardTitle = arg("card-title", "Before and after");
const RED = "#e5484d";

if (!beforeURL || !afterURL || (!scenesFile && !cardFile)) {
  console.error("error: --before-url, --after-url and --scenes (or --card) are required");
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

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function runSteps(page, steps = []) {
  for (const s of steps) {
    if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: s.timeout ?? 15000 });
    else if (s.click) {
      await page.click(s.click, { timeout: s.timeout ?? 15000 });
      await page.waitForTimeout(400);
    } else if (s.open) await page.evaluate((sel) => document.querySelectorAll(sel).forEach((d) => { d.open = true; }), s.open);
    else if (s.scrollTo)
      await page.evaluate(({ sel, offset }) => {
        const el = document.querySelector(sel);
        if (!el) return;
        // the nearest ancestor that actually scrolls: a side pane in many apps, else the page
        let box = el.parentElement;
        while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
        const scroller = box || document.scrollingElement;
        const top = el.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0);
        scroller.scrollTop += top - offset;
      }, { sel: s.scrollTo, offset: s.offset ?? 16 });
    else if (s.wait) await page.waitForTimeout(s.wait);
    else if (s.eval) await page.evaluate(`(async () => { ${s.eval} })()`);
    else throw new Error(`unknown step: ${JSON.stringify(s)}`);
  }
  await page.waitForTimeout(300);
}

// Runs in the page: measure each box from the DOM, draw it, and place its label where it covers the least text.
function annotate({ specs, red }) {
  const vw = innerWidth, vh = innerHeight, missing = [], moved = [];
  const R = (r) => ({ x: r.left ?? r.x, y: r.top ?? r.y, x2: r.right ?? r.x2, y2: r.bottom ?? r.y2 });
  const area = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y, b.y));
  const onScreen = (r) => r.x2 > 0 && r.y2 > 0 && r.x < vw && r.y < vh && r.x2 - r.x > 0;
  // every visible line of text and every control or image: labels should not hide them. Text in a closed <details>
  // or a collapsed accordion still reports layout rects in Chrome, so ask the browser whether it is actually rendered.
  const seen = (e) => !e?.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  const obstacles = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && seen(n.parentElement) ? 1 : 3) });
  for (let n; (n = walk.nextNode());) {
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (onScreen(R(r))) obstacles.push(R(r));
  }
  for (const e of document.querySelectorAll("input, textarea, select, img, svg, canvas, video, button")) {
    if (!seen(e)) continue;
    const r = R(e.getBoundingClientRect());
    if (onScreen(r)) obstacles.push(r);
  }
  const boxes = [];
  for (const s of specs) {
    let els = [...document.querySelectorAll(s.sel)];
    if (s.text != null) {
      const exact = els.filter((e) => e.textContent.trim() === s.text);
      els = exact.length ? exact : els.filter((e) => e.textContent.includes(s.text));
    }
    if (!s.all) els = els.slice(0, 1);
    if (s.withNext) els = els.flatMap((e) => [e, e.nextElementSibling].filter(Boolean));
    const measure = (e) => {
      if (!s.tight) return R(e.getBoundingClientRect());
      const rg = document.createRange();
      rg.selectNodeContents(e);
      return R(rg.getBoundingClientRect());
    };
    const rects = els.map(measure).filter((r) => r.x2 - r.x > 0 && r.y2 - r.y > 0);
    if (!rects.length) { missing.push(s.label || s.sel); continue; }
    const u = rects.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }));
    const pad = s.pad ?? 6;
    const b = { x: Math.max(3, u.x - pad), y: Math.max(3, u.y - pad), x2: Math.min(vw - 3, u.x2 + pad), y2: Math.min(vh - 3, u.y2 + pad) };
    if (b.x2 - b.x < 6 || b.y2 - b.y < 6) { missing.push(`${s.label || s.sel} (off screen)`); continue; }
    boxes.push({ ...b, label: s.label, at: s.at });
  }
  const root = document.createElement("div");
  root.id = "__before_after__";
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "2147483647", pointerEvents: "none" }); // CSSOM, so page CSP allows it
  document.documentElement.appendChild(root);
  for (const b of boxes) {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "fixed", left: `${b.x}px`, top: `${b.y}px`, width: `${b.x2 - b.x}px`, height: `${b.y2 - b.y}px`, boxSizing: "border-box",
      border: `3px solid ${red}`, borderRadius: "8px", boxShadow: "0 0 0 2px rgba(255,255,255,.8)",
    });
    root.appendChild(d);
  }
  const placed = [];
  for (const b of boxes) {
    if (!b.label) continue;
    const tag = document.createElement("div");
    tag.textContent = b.label;
    Object.assign(tag.style, {
      position: "fixed", left: "0", top: "0", background: red, color: "#fff", whiteSpace: "pre", borderRadius: "6px",
      font: '700 15px/1.35 -apple-system, "Segoe UI", system-ui, sans-serif', padding: "3px 9px", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
    });
    root.appendChild(tag);
    const w = tag.offsetWidth, h = tag.offsetHeight;
    const spots = {
      above: [b.x, b.y - h - 5], below: [b.x, b.y2 + 5], right: [b.x2 - w - 8, b.y + 7],
      after: [b.x2 + 8, (b.y + b.y2 - h) / 2], before: [b.x - w - 8, (b.y + b.y2 - h) / 2], inside: [b.x + 8, b.y + 7],
    };
    const order = [...new Set([b.at || "above", "right", "after", "above", "below", "before", "inside"])].filter((k) => spots[k]);
    let best = null;
    for (const [i, k] of order.entries()) {
      const [x, y] = spots[k];
      const r = { x, y, x2: x + w, y2: y + h };
      if (x < 2 || y < 2 || r.x2 > vw - 2 || r.y2 > vh - 2) continue;
      const cost = obstacles.reduce((c, o) => c + area(r, o), 0) + placed.reduce((c, p) => c + area(r, p) * 50, 0) + i * 4; // a nudge toward the requested spot
      if (!best || cost < best.cost) best = { r, cost, k };
    }
    if (best?.k !== order[0]) moved.push(`${b.label} (${order[0]} → ${best?.k ?? "clamped"})`);
    const r = best?.r ?? { x: Math.min(vw - w - 4, Math.max(4, b.x + 8)), y: Math.min(vh - h - 4, Math.max(4, b.y + 7)) };
    Object.assign(tag.style, { left: `${r.x}px`, top: `${r.y}px` });
    placed.push({ x: r.x, y: r.y, x2: r.x + w, y2: r.y + h });
  }
  return { missing, moved };
}

const chromium = loadChromium(appDir);
await mkdir(outDir, { recursive: true });
const browser = await chromium
  .launch({ headless: !headed, ...(channel ? { channel } : {}) })
  .catch((error) => {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    console.error(
      `error: Playwright in ${appDir} has no downloaded browser. Either:\n` +
        `  1. (cd "${appDir}" && npx playwright install chromium)\n` +
        `  2. re-run with --channel chrome to use your installed Google Chrome`,
    );
    process.exit(3);
  });

async function shot(base, path, steps, specs, file) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const url = path.startsWith("http") ? path : base.replace(/\/$/, "") + path;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 45000 }));
  await page.waitForTimeout(settle);
  await runSteps(page, steps);
  const found = await page.evaluate(annotate, { specs, red: RED });
  await page.screenshot({ path: file });
  await context.close();
  return found;
}

// render a small HTML page and save one element of it as PNG (1x: a pair is already two full screens wide)
async function render(html, file, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.locator(".wrap").screenshot({ path: file });
  await context.close();
}
const FONT = '-apple-system, "Segoe UI", system-ui, sans-serif';
const head = (label) => { const [main, ...rest] = String(label).split(/\s{2,}/); return `${esc(main)}${rest.length ? ` <span class="sub">${esc(rest.join("  "))}</span>` : ""}`; };
const pairHtml = (title, before, after) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eaeef2;font:16px/1.4 ${FONT}}
.wrap{display:inline-block;padding:22px 24px 24px}
h1{margin:0 0 14px;font-size:30px;line-height:1.2;color:#1f2328}
.row{display:flex;gap:24px}.panel{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.bar{color:#fff;font-weight:700;font-size:24px;padding:13px 20px}.b .bar{background:#57606a}.a .bar{background:${accent}}
.sub{font-weight:500;opacity:.8;margin-left:10px}
img{display:block;width:${W}px;height:${H}px}</style>
<div class="wrap"><h1>${esc(title)}</h1><div class="row">
<div class="panel b"><div class="bar">${head(beforeLabel)}</div><img src="data:image/png;base64,${before}"></div>
<div class="panel a"><div class="bar">${head(afterLabel)}</div><img src="data:image/png;base64,${after}"></div></div></div>`;
const cardHtml = (rows) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eaeef2;font:17px/1.45 ${FONT};color:#2b3038}
.wrap{display:inline-block;padding:24px}.card{width:1180px;background:#fff;padding:30px 36px 26px;box-shadow:0 1px 4px rgba(0,0,0,.18)}
h1{font-size:28px;margin:0 0 18px;color:#1f2328}table{width:100%;border-collapse:collapse}
th{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-align:left;padding:9px 14px;color:#fff}
th.k{background:transparent}th.b{background:#57606a;width:22%}th.a{background:${accent};width:40%}
th .sub{font-weight:500;text-transform:none;letter-spacing:0;margin-left:6px}
td{padding:11px 14px;border-bottom:1px solid #d8dee4;vertical-align:top}td.k{font-weight:600;color:#1f2328}
td.b{color:#57606a}td.a{background:${accent}14;color:#1f2328;font-weight:700}
.note{display:block;font-size:14px;font-weight:400;color:#57606a;margin-top:2px}
tr.s td{border:0;padding:16px 0 4px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#57606a}
</style><div class="wrap"><div class="card"><h1>${esc(cardTitle)}</h1><table>
<thead><tr><th class="k"></th><th class="b">${head(beforeLabel)}</th><th class="a">${head(afterLabel)}</th></tr></thead><tbody>
${rows.map((r) => `${r.section ? `<tr class="s"><td colspan="3">${esc(r.section)}</td></tr>` : ""}${r.label ? `<tr><td class="k">${esc(r.label)}</td><td class="b">${esc(r.before)}</td><td class="a">${esc(r.after)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ""}</td></tr>` : ""}`).join("")}
</tbody></table></div></div>`;

const result = { outDir, pairs: [] };
const scenes = scenesFile ? JSON.parse(await readFile(scenesFile, "utf8")) : [];
for (const s of scenes) {
  const name = String(s.name).replace(/[^a-z0-9-]+/gi, "-");
  const files = { before: join(outDir, `${name}--before.png`), after: join(outDir, `${name}--after.png`), pair: join(outDir, `${name}.png`) };
  const before = await shot(beforeURL, s.beforePath ?? s.path ?? "/", [...(s.steps || []), ...(s.beforeSteps || [])], s.before || [], files.before);
  const after = await shot(afterURL, s.afterPath ?? s.path ?? "/", [...(s.steps || []), ...(s.afterSteps || [])], s.after || [], files.after);
  const b64 = async (f) => (await readFile(f)).toString("base64");
  await render(pairHtml(s.title || s.name, await b64(files.before), await b64(files.after)), files.pair, 2 * W + 120);
  result.pairs.push({ name, file: files.pair, before: files.before, after: files.after,
    missing: { before: before.missing, after: after.missing }, moved: { before: before.moved, after: after.moved } });
}
if (cardFile) {
  result.card = join(outDir, "before-after-card.png");
  await render(cardHtml(JSON.parse(await readFile(cardFile, "utf8"))), result.card, 1300);
}
await browser.close();
await writeFile(join(outDir, "manifest.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
