# House Conventions

The opinionated structure every new project follows. It's derived from a production
prediction-market platform (split frontend/backend, pnpm monorepo, Rust engine). Mirror
it so projects feel familiar and the dev commands are muscle memory.

## The cardinal rule

**The frontend apps are thin UI clients. All stateful logic lives in the backend.**
Order matching, balances, business rules, anything authoritative → Rust. Next.js and React
Native fetch and render. Never embed a stateful engine inside Next.js — its route handlers
and server actions are at most thin proxies to the Rust API, never the source of truth.
This keeps the web and mobile apps interchangeable views over one source of truth.

## Monorepo layout

```text
<project>/
├── apps/                 # Deployed end-user apps (pnpm workspace members)
│   ├── web/              # Next.js frontend (App Router)
│   └── mobile/           # React Native (Expo) app
├── packages/             # Internal shared libraries (npm-style), optional
│   └── shared/           # shared TS types / API client / design tokens (optional)
├── services/             # Hosted backend services
│   └── api/              # Rust (Axum) API + business logic
├── db/                   # TS DB scripts: seed.ts, prune.ts (pg node driver)
├── docs/                 # PRD.md, BRANDING.md, and future internal docs
├── docker-compose.yml    # PostgreSQL
├── pnpm-workspace.yaml
├── package.json          # root: concurrently dev scripts
├── AGENTS.md             # conventions for future agents/devs (+ CLAUDE.md -> @AGENTS.md)
├── README.md
├── .env.example
└── .gitignore
```

Convention, kept consistent so the folder name tells you the deploy story:
- `apps/*` = **deployed** end-user apps
- `packages/*` = **shared** internal libraries (only add when something is genuinely shared)
- `services/*` = **hosted** backend services

Rust services have **no `package.json`** and are skipped by pnpm automatically — that's
expected, not a bug.

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "services/*"   # Node services live here too; Rust dirs (no package.json) are skipped
  - "packages/*"
```

## Root package.json — dev scripts

Use `concurrently` to run everything with one command. Delegate to Node packages with
`pnpm --filter <name>` and to Rust with `cd services/<name> && cargo run`. Give each Rust
service its own `CARGO_TARGET_DIR` under `~/.cache` so rebuilds don't thrash.

```jsonc
{
  "name": "<project>",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"pnpm dev:api\" \"pnpm dev:web\"",
    "dev:all": "concurrently -n api,web,mobile -c blue,green,magenta \"pnpm dev:api\" \"pnpm dev:web\" \"pnpm dev:mobile\"",
    "dev:web": "pnpm --filter <project>-web dev",
    "dev:mobile": "pnpm --filter <project>-mobile start",
    "dev:api": "cd services/api && CARGO_TARGET_DIR=\"${HOME}/.cache/cargo-target/<project>-api\" cargo run",
    "backend:build": "cd services/api && cargo build --release",
    "backend:test": "cd services/api && cargo test",
    "check": "pnpm --filter <project>-web check",
    "lint": "pnpm --filter <project>-web lint",
    "db:seed": "tsx db/seed.ts",
    "db:prune": "tsx db/prune.ts"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "tsx": "^4.22.0",
    "typescript": "^5",
    "@types/node": "^20",
    "@types/pg": "^8",
    "pg": "^8"
  }
}
```

Name packages `<project>-web`, `<project>-mobile`, `@<project>/shared`, etc. (mirror the
`<brand>-web` / `@<brand>/<lib>` convention). Replace `<project>` with the slug everywhere.

## Ports

Pick a stable block and document it. Suggested defaults (adjust to taste, just be
consistent and write them into `AGENTS.md`):

| Service          | Port |
| ---------------- | ---- |
| Next.js web      | 5005 |
| Expo dev server  | 8081 (Expo default) |
| Rust API         | 7890 |
| PostgreSQL       | 5432 |

The web app talks to the API via `NEXT_PUBLIC_API_URL` (default `http://localhost:7890`).

## Environment variables

Keep an `.env.example` at the root (template in `assets/env.example.tmpl`). Core set:

- `DATABASE_URL` — Postgres connection (backend + db scripts)
- `AUTH_SECRET` / `JWT_SECRET` — JWT signing secret
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Sign in with Google (OAuth)
- `GOOGLE_REDIRECT_URI` — OAuth callback (e.g. `http://localhost:7890/api/auth/google/callback`)
- `CORS_ORIGINS` — extra allowed web origins (comma-separated)
- `NEXT_PUBLIC_API_URL` — engine URL for the web app
- `EXPO_PUBLIC_API_URL` — engine URL for the mobile app

Never commit real secrets. `.env` is git-ignored; `.env.example` documents the keys.

## Database = SQLx migrations

There is **no ORM and no Prisma**. The schema lives in `services/api/migrations/*.sql` and
is applied by the backend on startup via `sqlx::migrate!`. The `db/seed.ts` and
`db/prune.ts` scripts use the `pg` node driver against the same `DATABASE_URL` for seeding
and retention/cleanup. See `references/scaffold-backend.md`.

## AGENTS.md for the new project

Generate an `AGENTS.md` (and a `CLAUDE.md` that just contains `@AGENTS.md`) so future
sessions inherit the conventions. Use `assets/AGENTS.md.tmpl` and fill in the project
specifics: what it is, the stack, the module layout, dev commands, ports, env vars, and
the cardinal rule above. This is how the project stays coherent across many agent sessions.
