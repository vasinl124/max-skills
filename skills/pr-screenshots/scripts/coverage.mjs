#!/usr/bin/env node
/**
 * coverage.mjs — check that every UI file a PR changes is shown by a before/after scene, so a screen the
 * scenes never reach (a dialog behind a click or a flag, a page that needs a seeded record) gets named in
 * the PR instead of silently missing from it.
 *
 * Usage:
 *   gh pr diff --name-only | node coverage.mjs --scenes scenes.json[,admin-scenes.json] > not-captured.md
 *
 * Each scene lists the changed files it shows in "covers" and boxes the change on its AFTER side: the box is
 * what proves the change is on screen (one whose element never appeared lands in before-after.mjs's `missing`).
 * A screen that can't be captured is a scene with "skip": "<why>" plus the files it would have covered
 * (before-after.mjs leaves skipped scenes out). Pass every scenes file in one call (one per app in a
 * monorepo): coverage is checked across all of them.
 *
 * Exits 1, saying what's wrong on stderr, when a changed UI file is in no scene's "covers" or a scene covers
 * files but boxes nothing. Otherwise prints a "Not captured" list with each reason, for the PR description;
 * nothing when every screen was captured.
 */
import { readFileSync } from "node:fs";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const scenesArg = arg("scenes");
if (!scenesArg || process.stdin.isTTY) {
  console.error("usage: gh pr diff --name-only | node coverage.mjs --scenes scenes.json[,more.json]");
  process.exit(2);
}

let input = "";
for await (const chunk of process.stdin) input += chunk; // not readFileSync(0): that throws EAGAIN on a non-blocking pipe
const files = input.split("\n").map((s) => s.trim()).filter(Boolean);
if (!files.length) {
  // an empty list means the diff command failed, not that nothing changed: never pass on it
  console.error("error: no changed files on stdin; pipe in `gh pr diff --name-only`");
  process.exit(2);
}

// ponytail: file-extension heuristic; a .ts hook or a flag config that changes a screen isn't required,
// so add those to a scene's "covers" by hand when they matter.
const UI = /\.(tsx|jsx|vue|svelte|astro|html|erb|hbs|liquid|css|scss|sass|less)$/i;
const NOT_UI = /(^|\/)__tests__\/|\.(test|spec|stories)\.\w+$/i;
const changed = files.filter((f) => UI.test(f) && !NOT_UI.test(f));

const scenes = scenesArg.split(",").flatMap((f) => JSON.parse(readFileSync(f.trim(), "utf8")));
const covered = new Set(scenes.flatMap((s) => s.covers || []));
const uncovered = changed.filter((f) => !covered.has(f));
const unboxed = scenes.filter((s) => !s.skip && s.covers?.length && !s.after?.length).map((s) => s.name);
if (uncovered.length) {
  console.error(
    `not covered: ${uncovered.length} changed UI file(s) are in no scene's "covers". Add each to the scene ` +
      `that shows it, write a scene that reaches it, or list it in a scene with "skip": "<why>":`,
  );
  for (const f of uncovered) console.error(`  ${f}`);
}
if (unboxed.length) {
  console.error(`nothing boxed: ${unboxed.join(", ")} cover changed files but box nothing on the AFTER side. Box the change.`);
}
if (uncovered.length || unboxed.length) process.exit(1);

const skipped = scenes.filter((s) => s.skip);
console.error(`coverage ok: ${changed.length} changed UI file(s), ${skipped.length} scene(s) not captured`);
if (skipped.length) {
  console.log("**Not captured**\n");
  for (const s of skipped) console.log(`- ${(s.covers || []).map((f) => `\`${f}\``).join(", ")}: ${s.skip}`);
}
