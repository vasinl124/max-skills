#!/usr/bin/env node
/**
 * alloc-ports.mjs — print free TCP ports so several dev stacks can run at once.
 *
 * Usage:
 *   node alloc-ports.mjs --near 3000,8787            # first FREE port >= each base
 *   node alloc-ports.mjs --near 3000,8787,3100,8887  # two apps, each with web + API
 *   node alloc-ports.mjs --count 2 --base 5200       # 2 free ports scanning up from base
 *
 * Prints the chosen ports space-separated, in the requested order (e.g. "3000 8787").
 * If a preferred base is taken it climbs to the next free port; ports already chosen
 * in THIS call are never reused, so a set never self-collides. So the 1st stack gets
 * 3000/8787, a 2nd concurrent stack climbs to 3001/8788, and so on.
 *
 * Read them straight into shell vars:
 *   read -r WEB API <<<"$(node alloc-ports.mjs --near 3000,8787)"
 */
import net from "node:net";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function firstFreeFrom(start, taken) {
  for (let p = start; p <= 65535; p++) {
    if (taken.has(p)) continue;
    if (await isFree(p)) return p;
  }
  throw new Error(`no free port at or above ${start}`);
}

const nearArg = arg("near");
const count = Number(arg("count", "1"));
const base = Number(arg("base", "5200"));

const chosen = [];
const taken = new Set();

if (nearArg) {
  for (const b of nearArg.split(",").map((s) => Number(s.trim())).filter(Boolean)) {
    const p = await firstFreeFrom(b, taken);
    taken.add(p);
    chosen.push(p);
  }
} else {
  let cursor = base;
  for (let i = 0; i < count; i++) {
    const p = await firstFreeFrom(cursor, taken);
    taken.add(p);
    chosen.push(p);
    cursor = p + 1;
  }
}

process.stdout.write(chosen.join(" ") + "\n");
