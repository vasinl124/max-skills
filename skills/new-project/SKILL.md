---
name: new-project
description: >-
  Start ANY brand-new project, app, SaaS, or product from an empty or nearly-empty folder.
  Load it FIRST, before interviewing the user, running git init, or writing code: it encodes
  a playbook you would otherwise skip. A batched interview, competitor and real-user-complaint
  research (Reddit, Hacker News, forums, app-store/G2 reviews), a product PRD, a branding and
  design-token system, then a scaffolded pnpm monorepo (Next.js web + Expo mobile + Rust/Axum
  + SQLx API with roll-your-own JWT auth: email/password and Sign in with Google). Use whenever
  the user wants to start, kick off, bootstrap, scaffold, or spin up a new project/app/product,
  pastes a fresh product idea to build from scratch, or says "new project", "let's build X",
  "start a new app", "set up a new repo", even without the words "skill" or "scaffold". Not
  for changes to an existing project, a standalone PRD or research task, or renaming
  something that already exists.
---

# New Project Bootstrap

Take someone from "empty folder + an idea" to "a researched PRD, a brand, and a running
monorepo committed to git." This skill orchestrates the whole kickoff so the founder
doesn't have to remember the order of operations.

The spirit comes from a real product kickoff (see `references/research-and-prd.md` for the
canonical example): **research the landscape and the complaints first, write the
vision down, then build.** Plan on cheap artifacts (docs), get a thumbs-up, *then* spend
tokens on code.

## The default stack (house style)

Unless the interview says otherwise, build this:

| Layer        | Choice                                                              |
| ------------ | ------------------------------------------------------------------ |
| Web frontend | **Next.js** (App Router) + TypeScript + Tailwind + React + shadcn/ui |
| Mobile       | **React Native via Expo** (Expo Router) + TypeScript               |
| Backend      | **Rust** — Axum + SQLx (async Postgres, no ORM), edition 2024      |
| Auth         | **Roll-your-own JWT** in the backend: bcrypt email/password **+** Sign in with Google |
| Database     | **PostgreSQL** via docker-compose; schema = SQLx migrations applied on boot |
| Monorepo     | **pnpm workspace** (`apps/*`, `services/*`, `packages/*`) + `concurrently` dev scripts |

This mirrors the conventions in `references/conventions.md` — read that before scaffolding.
The cardinal rule: **the Next.js / RN apps are thin UI clients; all stateful logic lives
in the Rust backend.** Never embed a stateful engine inside Next.js — its route handlers
and server actions are at most thin proxies to the Rust API, never the authoritative backend.

## How to run the skill

Work through the phases in order. **Phases 0–4 are cheap (interview + research + docs);
Phase 5 onward is expensive (code-gen + installs).** There is a hard checkpoint after
Phase 4 — do not scaffold until the user approves the PRD and branding. That's the cheap
place to course-correct.

Adapt to scope: if the user only wants a webapp, skip `apps/mobile`. If there's no
backend, skip `services/api` (but say so — most products need one). Only scaffold the
surfaces the interview surfaces.

> **Frameworks move fast.** Next.js, React, Tailwind, Expo, Axum, and SQLx all change in
> ways your training data won't reflect. Before writing framework code, pull current docs
> via the **context7** MCP (`resolve-library-id` → `query-docs`), and heed any in-repo
> deprecation notices. For web scaffolding, verify `create-next-app` flags against the
> official Next.js docs and use the current stable major (Next.js 16 as of writing) unless
> the user explicitly asks for another.

---

### Phase 0 — Preflight & git init

1. Confirm the working directory is the intended project root. Run `pwd` and a quick
   `ls -la`. If the folder is **non-empty or already contains a project**, stop and
   confirm with the user before touching anything — never scaffold over existing work.
2. If it's not already a git repo (`git rev-parse --git-dir` fails), run `git init`.
   If it already is one, note that and continue.
3. Don't create any other files yet — the interview shapes everything.

### Phase 1 — Interview

Goal: learn **what we're building** and **which surfaces** it needs, with the fewest
questions. Use the `AskUserQuestion` tool and **batch** related questions into one call —
don't interrogate one at a time.

Cover, in roughly this order (collapse into 1–2 batched `AskUserQuestion` calls):

- **The vision** — "What are we building?" Get the one-liner + enough detail to research.
  If the user already pasted a rich brief (like the RogerIQ example), don't re-ask — just
  confirm your understanding and fill gaps.
- **Surfaces** — Web app? Mobile (iOS/Android via RN)? Both? Backend needed? (Default: web
  + backend; ask whether mobile is in scope now or later.)
- **Auth** — Confirm email/password + Sign in with Google (the default), or adjust
  (passwordless, more OAuth providers, none).
- **Naming** — Project / product name and a short slug (used for package names, db name,
  bundle ids). If they don't have one, you can propose options during branding.
- **Anything load-bearing** — payments, AI features, real-time, specific integrations,
  target launch, niches/ICP. These shape both the PRD and the scaffold.

Confirm the resolved stack back to the user in one line before moving on (so an override
like "actually use SvelteKit" gets caught now, not after scaffolding).

### Phase 2 — Research

Research the landscape and — crucially — the **gaps and complaints**, so the PRD targets
real pain. Full methodology in `references/research-and-prd.md`. In short:

- Spawn **parallel subagents** (the `Agent` tool, `general-purpose`) so this is fast:
  one on **competitors** (top existing solutions, their features, pricing, positioning),
  one on **community pain** (Reddit, Hacker News, forums, X, app-store/G2 reviews — what
  users actually complain about and wish existed).
- Use `WebSearch` + `WebFetch`; the `deep-research` skill is a good heavier option for big
  spaces. Prefer primary sources and real user quotes over listicles.
- Synthesize into a tight findings brief: who the players are, where they fall short, and
  the wedge for this product. This feeds Phase 3 directly.

Scale research to the project: a niche internal tool needs a light pass; a competitive
SaaS deserves the full RogerIQ-style dig.

### Phase 3 — PRD

Write `docs/PRD.md` using the template in `references/research-and-prd.md`. Keep it
**product-focused, not technical** (architecture comes from this skill, not the PRD):
vision, target users/niches, the problem & the gap you're exploiting, core features,
differentiators, pricing (competitive — undercut incumbents, generous free tier), and
explicit non-goals. Put yourself in the shoes of the starting ICP and cover both the
table-stakes features from the landscape research and the gaps you found.

### Phase 4 — Branding & design system → ⛔ CHECKPOINT

Write `docs/BRANDING.md` and the design tokens using `references/branding.md`: name
rationale, positioning/voice, color palette, typography, and a short "design language"
statement, plus the concrete CSS custom properties (light + dark) that Phase 5 wires into
the web app's global CSS. This is a **written** design system (no image generation) —
but it must be specific enough to code against.

**Then STOP and show the user the PRD + branding for approval.** Summarize crisply and ask
for a go/no-go (and any edits) before scaffolding. This is the last cheap checkpoint.

### Phase 5 — Scaffold the monorepo

Once approved, scaffold. Read the relevant reference(s) first, then build only the
surfaces in scope:

- **Workspace root** — `references/conventions.md` (pnpm-workspace.yaml, root
  `package.json` with `concurrently` dev scripts, `AGENTS.md`, `README.md`, `.gitignore`,
  `.env.example`, `docker-compose.yml`). Templates live in `assets/`.
- **Web (`apps/web`)** & **Mobile (`apps/mobile`)** — `references/scaffold-frontend.md`.
- **Backend (`services/api`)** — `references/scaffold-backend.md` (Axum + SQLx + the
  roll-your-own JWT auth: bcrypt + Google OAuth).

Wire the design tokens from Phase 4 into the web app. Keep the apps thin and the backend
authoritative.

### Phase 6 — Install & verify

- Install: `pnpm install` at the root; run `pnpm --filter <project>-web check`; run
  `cargo build` (or `cargo check`) in `services/api`.
- Bring up Postgres (`docker compose up -d db`) and confirm the backend boots + applies
  migrations, or at minimum that everything **type-checks / compiles**. Fix what breaks.
- Don't claim it runs if you didn't verify it. If something can't be verified in this
  environment (e.g. no Docker), say so and leave clear instructions.

### Phase 7 — First commit & handoff

- Create a sensible `.gitignore` (node_modules, target/, .env, .expo, .next, out, etc.) **before**
  the first `git add` so secrets/artifacts never enter history.
- Commit: `chore: scaffold <project> — PRD, branding, web + mobile + api`.
- Hand off with a short summary: what was built, how to run it (`pnpm dev`, env vars to
  fill, `docker compose up -d db`), and the suggested first features to build from the PRD.

---

## Reference files

Read these as each phase needs them (progressive disclosure — don't load all upfront):

- `references/conventions.md` — the house style: monorepo layout, ports, env vars, dev
  scripts, naming, the split-frontend/backend rule. **Read before Phase 5.**
- `references/research-and-prd.md` — research methodology + the canonical kickoff example
  + the PRD template. **Read for Phases 2–3.**
- `references/branding.md` — branding doc template + design-token system. **Read for Phase 4.**
- `references/scaffold-frontend.md` — Next.js web + Expo mobile scaffolding. **Read for Phase 5.**
- `references/scaffold-backend.md` — Rust Axum + SQLx + JWT/Google auth. **Read for Phase 5.**

Templates to copy and fill: `assets/` (`AGENTS.md.tmpl`, `globals.tokens.css`,
`docker-compose.yml`, `env.example.tmpl`).
