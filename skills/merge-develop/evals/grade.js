#!/usr/bin/env node
// Grade a merge-develop run against a fixture repo.
//   node grade.js <scenario> <repoPath>
// Prints { "expectations": [ { text, passed, evidence } ] } to stdout.
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const [, , scenario, repoArg] = process.argv;
if (!scenario || !repoArg) {
  console.error("usage: node grade.js <scenario> <repoPath>");
  process.exit(2);
}
const repo = path.resolve(repoArg);
const git = (args) => cp.execSync(`git ${args}`, { cwd: repo, encoding: "utf8" }).trim();
const tryGit = (args) => { try { return { ok: true, out: git(args) }; } catch (e) { return { ok: false, out: (e.stdout || "") + (e.stderr || "") }; } };
const read = (p) => fs.readFileSync(path.join(repo, p), "utf8");
const exists = (p) => fs.existsSync(path.join(repo, p));

const expectations = [];
const check = (text, fn) => {
  try {
    const { passed, evidence } = fn();
    expectations.push({ text, passed: !!passed, evidence: String(evidence || "") });
  } catch (e) {
    expectations.push({ text, passed: false, evidence: "error: " + e.message });
  }
};

// --- assertions common to every scenario ---
check("Merge was completed (no merge left in progress)", () => {
  const mh = tryGit("rev-parse -q --verify MERGE_HEAD");
  return { passed: !mh.ok || !mh.out, evidence: mh.out ? "MERGE_HEAD still present: " + mh.out : "no MERGE_HEAD" };
});
check("origin/develop is now merged into HEAD", () => {
  const r = tryGit("merge-base --is-ancestor origin/develop HEAD");
  return { passed: r.ok, evidence: r.ok ? "develop is an ancestor of HEAD" : "develop NOT merged into HEAD" };
});
check("No unmerged (conflicted) paths remain", () => {
  const r = tryGit("diff --name-only --diff-filter=U");
  return { passed: r.ok && !r.out, evidence: r.out ? "unmerged: " + r.out : "none" };
});
check("No conflict markers anywhere in tracked files", () => {
  // git grep exits 1 (no matches) on success here.
  const r = tryGit("grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- . :^*.generated.json");
  const hits = r.out ? r.out : "";
  return { passed: !hits, evidence: hits ? "markers found:\n" + hits : "no markers" };
});

// --- scenario-specific assertions ---
if (scenario === "code-intent-merge") {
  check("Both intents preserved: timeout (develop) AND retries (feature) kept", () => {
    const src = read("src/settings.ts");
    const hasBoth = src.includes("timeout") && src.includes("retries") && src.includes("name");
    return { passed: hasBoth, evidence: src };
  });
  check("Verification test passes (node test.js)", () => {
    const r = tryGit; // not git
    try { const out = cp.execSync("node test.js", { cwd: repo, encoding: "utf8" }); return { passed: true, evidence: out.trim() }; }
    catch (e) { return { passed: false, evidence: ((e.stdout||"") + (e.stderr||"")).trim() }; }
  });
}

if (scenario === "generated-file-regen") {
  check("chains.json contains all three chains (ethereum, base, arbitrum)", () => {
    const names = JSON.parse(read("data/chains.json")).map((c) => c.name);
    const missing = ["ethereum", "base", "arbitrum"].filter((n) => !names.includes(n));
    return { passed: missing.length === 0, evidence: "names: " + JSON.stringify(names) };
  });
  check("Generated file was REGENERATED (matches a fresh run of the generator), not hand-merged", () => {
    const committed = read("data/chains.generated.json").trim();
    cp.execSync("node scripts/generate.js", { cwd: repo });
    const fresh = read("data/chains.generated.json").trim();
    return { passed: committed === fresh, evidence: committed === fresh ? "generated output is consistent (count=3 expected)" : "committed generated file did NOT match regenerate" };
  });
}

if (scenario === "dirty-tree-stash") {
  check("Conflict resolved: all routes present (/home, /about, /contact)", () => {
    const src = read("src/routes.ts");
    const missing = ["/home", "/about", "/contact"].filter((r) => !src.includes(r));
    return { passed: missing.length === 0, evidence: src };
  });
  check("Uncommitted tracked change preserved (src/notes.txt == 'v2 WIP')", () => {
    const v = exists("src/notes.txt") ? read("src/notes.txt").trim() : "<missing>";
    return { passed: v === "v2 WIP", evidence: "notes.txt = " + JSON.stringify(v) };
  });
  check("Untracked file preserved (scratch.txt still present)", () => {
    const v = exists("scratch.txt") ? read("scratch.txt").trim() : "<missing>";
    return { passed: v === "scratch work", evidence: "scratch.txt = " + JSON.stringify(v) };
  });
}

const passed = expectations.filter((e) => e.passed).length;
const total = expectations.length;
const summary = { passed, failed: total - passed, total, pass_rate: total ? passed / total : 0 };
process.stdout.write(JSON.stringify({ summary, expectations }, null, 2) + "\n");
