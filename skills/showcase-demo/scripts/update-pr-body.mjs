#!/usr/bin/env node
/**
 * update-pr-body.mjs — splice a markdown section into a GitHub PR description,
 * idempotently, between HTML marker comments. Preview-only by default; only
 * touches the PR when you pass --write.
 *
 * Usage:
 *   node update-pr-body.mjs --marker screenshots --section-file section.md [--pr 123] [--write]
 *
 * Without --pr it uses the PR for the current branch (`gh pr view`).
 * Without --write it writes the assembled body to a temp file and prints the
 * path — inspect it, show the user, then re-run the SAME command with --write.
 *
 * Requires: gh (authenticated).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(`--${name}`);
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const marker = arg("marker", "screenshots");
const sectionFile = arg("section-file");
const prArg = arg("pr");
const doWrite = flag("write");
if (!sectionFile) {
  console.error("error: --section-file <path> is required");
  process.exit(2);
}

const START = `<!-- pr-${marker}:start -->`;
const END = `<!-- pr-${marker}:end -->`;

const view = JSON.parse(
  gh(["pr", "view", ...(prArg ? [prArg] : []), "--json", "number,body,url,headRefName"]),
);
const section = readFileSync(sectionFile, "utf8").trim();
const block = `${START}\n${section}\n${END}`;

let body = view.body || "";
if (body.includes(START) && body.includes(END)) {
  body = body.replace(new RegExp(`${esc(START)}[\\s\\S]*?${esc(END)}`), block);
} else {
  body = `${body.trimEnd()}\n\n${block}\n`;
}

const out = join(tmpdir(), `pr-${view.number}-body.md`);
writeFileSync(out, body);

if (doWrite) {
  gh(["pr", "edit", String(view.number), "--body-file", out]);
  console.log(`updated ${view.url}`);
} else {
  console.log(out);
  console.error(
    `preview written for PR #${view.number} (${view.headRefName}). ` +
      `Show it to the user, then re-run with --write to publish.`,
  );
}
