---
name: new-project
description: Start a brand-new app, SaaS or product from an empty folder. Interviews the user, researches competitors and real user complaints (Reddit, Hacker News, forums, app-store and G2 reviews), writes a product PRD and a brand with design tokens, then — once the user approves those docs — scaffolds a pnpm monorepo, verifies it builds and makes the first commit. Default stack is Next.js web, Expo (React Native) mobile and a Rust API (Axum + SQLx on Postgres) with email/password and Sign in with Google; the interview can swap or drop any layer. Use when the user wants to start, kick off, bootstrap or scaffold a new project, or describes a fresh product idea to build from scratch ("new project", "let's build X", "start a new app"). Not for features in an existing repo, a standalone PRD or research task, or redesigning something that already exists.
license: MIT
---

# New Project

Take someone from "empty folder + an idea" to a researched PRD, a brand, and a running
monorepo committed to git, in an order that spends the cheap tokens first: research the
landscape and the complaints, write the vision down, get a thumbs-up, *then* generate code.

## The default stack

Unless the interview says otherwise, build this:

| Layer        | Choice                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Web frontend | **Next.js** (App Router) + TypeScript + Tailwind + shadcn/ui           |
| Mobile       | **React Native via Expo** (Expo Router) + TypeScript                   |
| Backend      | **Rust**: Axum + SQLx (async Postgres, no ORM), edition 2024           |
| Auth         | In the backend: email/password (bcrypt) **+** Sign in with Google. The API issues the session: an HttpOnly cookie on web, a bearer token on mobile |
| Database     | **PostgreSQL** via docker-compose; schema = SQLx migrations applied on boot |
| Monorepo     | **pnpm workspace** (`apps/*`, `services/*`, `packages/*`) + `concurrently` dev scripts |

The cardinal rule: **the Next.js and React Native apps are thin UI clients; all stateful
logic lives in the Rust backend.** Next.js route handlers and server actions are at most thin
proxies to the Rust API, never the authoritative backend. `references/conventions.md` has the
rest; read it before scaffolding.

## How to run the skill

Work through the phases in order. **Phases 0–4 are cheap (interview, research, docs); Phase 5
onward is expensive (code generation, installs).** There is a hard checkpoint after Phase 4:
do not scaffold until the user approves the PRD and branding.

Adapt to scope: web-only means no `apps/mobile`; no backend means no `services/api` (say so,
since most products need one). Scaffold only the surfaces the interview asks for.

> **Frameworks move fast.** Next.js, Expo, Tailwind, shadcn, Axum and SQLx all change in ways
> your training data won't reflect. Before writing framework code, check current docs (the
> official site, or a docs tool such as the context7 MCP) and heed deprecation notices. Use
> each framework's current stable major unless the user asks for another.

---

### Phase 0 — Preflight & git init

1. Confirm the working directory is the intended project root (`pwd`, `ls -la`). If it is
   **non-empty or already holds a project**, stop and confirm with the user; never scaffold
   over existing work.
2. If it isn't a git repo yet (`git rev-parse --git-dir` fails), run `git init`.
3. Create nothing else yet; the interview shapes everything.

### Phase 1 — Interview

Learn **what we're building** and **which surfaces** it needs, in as few questions as
possible: one or two batched rounds (Claude Code's `AskUserQuestion` takes several questions
at once), never one question at a time.

- **The vision**: the one-liner, plus enough detail to research. If the user pasted a rich
  brief, don't re-ask; confirm your understanding and fill the gaps.
- **Surfaces**: web, mobile (iOS/Android), backend? Default: web + backend; ask whether mobile
  is in scope now or later.
- **Auth**: confirm email/password + Sign in with Google, or adjust (passwordless, other
  providers, none).
- **Naming**: product name and a short slug (package names, database name, bundle ids). No
  name yet? Propose options during branding.
- **Anything load-bearing**: payments, AI features, real-time, integrations, launch date,
  target niches. These shape both the PRD and the scaffold.

Read the resolved stack back in one line before moving on, so an override ("actually, use
SvelteKit") is caught now rather than after scaffolding.

### Phase 2 — Research

Research the landscape and, above all, the **gaps and complaints**, so the PRD targets real
pain. Method in `references/research-and-prd.md`. In short:

- Two research passes, in parallel if your agent can run subagents (Claude Code's `Agent`
  tool, for example), otherwise one after the other: **competitors** (top solutions,
  features, pricing, positioning) and **community pain** (Reddit, Hacker News, forums, X,
  app-store and G2 reviews: what users complain about and wish existed).
- Use web search and page fetches; a deep-research skill, if you have one, suits big spaces.
  Prefer primary sources and real user quotes over listicles.
- Synthesize a tight findings brief: the players, where they fall short, and the wedge.

Scale it to the project: an internal tool needs a light pass; a competitive SaaS deserves a
deep one.

### Phase 3 — PRD

Write `docs/PRD.md` from the template in `references/research-and-prd.md`. Keep it
**product-level, not technical** (the architecture comes from this skill): vision, target
users, the problem and the gap, core features, differentiators, pricing, non-goals. Stand in
the starting users' shoes and cover both the table-stakes features the research found and the
gaps.

### Phase 4 — Branding & design system → ⛔ CHECKPOINT

Write `docs/BRANDING.md` and the design tokens with `references/branding.md`: name rationale,
positioning and voice, color palette, typography, a short design-language statement, and
concrete CSS custom properties (light + dark) for Phase 5. Written only, no image generation,
but specific enough to code against.

**Then STOP. Show the user the PRD and branding, summarized crisply, and ask for a go/no-go
(and edits) before scaffolding.** This is the last cheap place to change course.

### Phase 5 — Scaffold the monorepo

Once approved, read the relevant references and build only the surfaces in scope:

- **Ports first**: check the default ports are free and shift any that aren't
  (`references/conventions.md`, "Ports"). Use the final numbers everywhere.
- **Workspace root**: `references/conventions.md` covers `pnpm-workspace.yaml`, the root
  `package.json`, `AGENTS.md` + `CLAUDE.md`, `README.md`, `.gitignore`, `.env.example` and
  `docker-compose.yml`. Templates are in `assets/`.
- **Web (`apps/web`)** and **mobile (`apps/mobile`)**: `references/scaffold-frontend.md`.
- **Backend (`services/api`)**: `references/scaffold-backend.md`, covering Axum + SQLx and the
  auth (bcrypt + Google, cookie and bearer sessions). Its security rules are not optional.

Wire the Phase 4 tokens into the web app. Keep the apps thin and the backend authoritative.

### Phase 6 — Install & verify

- `pnpm install` at the root, `pnpm --filter <project>-web check`, and `cargo build` in
  `services/api`.
- Bring up Postgres (`docker compose up -d --wait db`), boot the API, and run the auth smoke
  test in `references/scaffold-backend.md` ("Verify it boots"). At minimum everything must
  type-check and compile. Fix what breaks.
- Don't claim it runs if you didn't see it run. If something can't be verified here (no
  Docker, say), say so and leave clear instructions.

### Phase 7 — First commit & handoff

- Create `.gitignore` (node_modules, target/, .env, .expo, .next, out, …) **before** the first
  `git add`, and check that `git status` shows no `.env`: secrets must never enter history.
- Commit: `chore: scaffold <project> — PRD, branding, web + mobile + api` (name the surfaces
  you actually built).
- Hand off briefly: what was built, how to run it (the `.env` values to fill, `pnpm dev`), and
  the first features to build from the PRD.

---

## Reference files

Read each when its phase needs it, not all upfront:

- `references/conventions.md`: monorepo layout, ports, env vars, dev scripts, naming, the
  thin-client rule. **Before Phase 5.**
- `references/research-and-prd.md`: research method, an example brief, the PRD template.
  **Phases 2–3.**
- `references/branding.md`: branding template and design tokens. **Phase 4.**
- `references/scaffold-frontend.md`: Next.js web and Expo mobile. **Phase 5.**
- `references/scaffold-backend.md`: Rust API, database and auth. **Phase 5.**

Templates to copy and fill: `assets/AGENTS.md.tmpl`, `assets/globals.tokens.css`,
`assets/docker-compose.yml`, `assets/env.example.tmpl`.
