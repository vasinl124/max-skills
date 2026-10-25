# Conventions

The structure every project from this skill follows, so the layout and the dev commands are the
same in each one.

## The cardinal rule

**The frontend apps are thin UI clients. All stateful logic lives in the backend.** Business
rules, money, permissions, anything authoritative → Rust. Next.js and React Native fetch and
render. Next.js route handlers and server actions are at most thin proxies to the Rust API,
never the source of truth. That keeps web and mobile interchangeable views over one backend.

## Monorepo layout

```text
<project>/
├── apps/                 # deployed end-user apps (pnpm workspace members)
│   ├── web/              # Next.js (App Router)
│   └── mobile/           # React Native (Expo)
├── packages/             # shared internal libraries; only when something is really shared
│   └── shared/           # e.g. shared TS types, API client, design tokens
├── services/             # hosted backend services
│   └── api/              # Rust (Axum) API + business logic
├── docs/                 # PRD.md, BRANDING.md, later internal docs
├── docker-compose.yml    # PostgreSQL for local dev
├── pnpm-workspace.yaml
├── package.json          # root: concurrently dev scripts
├── AGENTS.md             # conventions for future agents and devs (+ CLAUDE.md containing @AGENTS.md)
├── README.md
├── .env.example
└── .gitignore
```

The folder tells you the deploy story: `apps/*` are **deployed** apps, `packages/*` are
**shared** libraries, `services/*` are **hosted** backends. Rust services have no
`package.json`, so pnpm skips them; that's expected, not a bug.

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "services/*"   # Node services live here too; Rust dirs (no package.json) are skipped
  - "packages/*"
```

## Root package.json

`concurrently` runs everything with one command. Node packages are reached with
`pnpm --filter <name>`, Rust with `cd services/<name> && cargo run`; each Rust service gets its
own `CARGO_TARGET_DIR` under `~/.cache` so rebuilds don't thrash.

```jsonc
{
  "name": "<project>",
  "private": true,
  "packageManager": "pnpm@<the version `pnpm --version` prints>",
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"pnpm dev:api\" \"pnpm dev:web\"",
    "dev:all": "concurrently -n api,web,mobile -c blue,green,magenta \"pnpm dev:api\" \"pnpm dev:web\" \"pnpm dev:mobile\"",
    "dev:web": "pnpm --filter <project>-web dev",
    "dev:mobile": "pnpm --filter <project>-mobile start",
    "dev:api": "cd services/api && CARGO_TARGET_DIR=\"${HOME}/.cache/cargo-target/<project>-api\" cargo run",
    "backend:build": "cd services/api && cargo build --release",
    "backend:test": "cd services/api && cargo test",
    "check": "pnpm --filter <project>-web check",
    "lint": "pnpm --filter <project>-web lint"
  }
}
```

Then run `pnpm add -Dw concurrently` (`-w` targets the workspace root) so the current version is
recorded rather than a stale pin.

Name packages `<project>-web`, `<project>-mobile`, `@<project>/shared`, with the slug in place of
`<project>` everywhere.

## Ports

Suggested defaults; being consistent matters more than the numbers:

| Service         | Port |
| --------------- | ---- |
| Next.js web     | 5005 |
| Expo dev server | 8081 (Expo's default) |
| Rust API        | 7890 |
| PostgreSQL      | 5432 |

**Check they're free before writing them anywhere:** `lsof -nP -iTCP:<port> -sTCP:LISTEN`
prints nothing for a free port. Another project's dev server, a local Postgres or a proxy tool
may hold one (Clash's default proxy port is 7890). If so, shift that service to a free port and
use the new number in every file; the templates in `assets/` take `{{WEB_PORT}}`,
`{{API_PORT}}` and `{{DB_PORT}}`. Record the final ports in `AGENTS.md`.

The web app reaches the API through `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:7890`).

## Environment variables

Keep `.env.example` at the root (template: `assets/env.example.tmpl`):

- `DATABASE_URL`: the Postgres connection.
- `JWT_SECRET`: signs session tokens; 32+ random bytes (`openssl rand -base64 48`). The API
  refuses to start without it, so there is no placeholder default to forget to change.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Sign in with Google (an OAuth client of type
  *Web application*).
- `GOOGLE_REDIRECT_URI`: the OAuth callback, e.g. `http://localhost:7890/api/auth/google/callback`.
- `WEB_ORIGIN`: the web app's origin, e.g. `http://localhost:5005`. It's the only origin CORS
  allows, and where Google sign-in lands.
- `COOKIE_DOMAIN`: production only, when web and API sit on sibling subdomains
  (`app.example.com` + `api.example.com` → `example.com`). Leave it empty locally.
- `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL`: the API's URL for the web and mobile apps.

Never commit real secrets: `.env` is git-ignored; `.env.example` documents the keys.

## Database = SQLx migrations

No ORM, no Prisma. The schema lives in `services/api/migrations/*.sql` and the backend applies it
on startup with `sqlx::migrate!`. Reference data the product needs ships as a migration too. See
`references/scaffold-backend.md`.

## AGENTS.md for the new project

Generate `AGENTS.md` (plus a `CLAUDE.md` whose whole content is `@AGENTS.md`) from
`assets/AGENTS.md.tmpl`, so future sessions in any agent inherit these conventions: what the
product is, the stack, the layout, dev commands, ports, env vars, the auth model and the cardinal
rule.
