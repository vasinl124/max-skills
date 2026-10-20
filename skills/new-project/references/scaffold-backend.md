# Scaffold — Backend (Rust + Axum + SQLx + Auth)

The authoritative service. Rust (edition 2024), Axum web framework, SQLx for async Postgres
(no ORM), JWT auth rolled in-house: bcrypt email/password **and** Sign in with Google.

**Verify crate APIs against current docs** (context7: `axum`, `sqlx`, `tokio`,
`jsonwebtoken`, `oauth2`) — Axum's extractor/router API and SQLx's macros shift between
versions. Pin recent versions in `Cargo.toml` and adapt the snippets below to whatever the
current API is.

## 1. Create the crate

```bash
mkdir -p services/api && cd services/api
cargo init --name api
```

The new project's root `dev:api` script already points here with a dedicated
`CARGO_TARGET_DIR` (see `references/conventions.md`).

## 2. Cargo.toml dependencies

Use recent versions (check crates.io / context7 for the latest at scaffold time):

```toml
[package]
name = "api"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "macros", "chrono", "uuid", "rust_decimal"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
jsonwebtoken = "9"
bcrypt = "0.15"
oauth2 = "4"                      # Google OAuth (authorization-code flow)
reqwest = { version = "0.12", features = ["json"] }   # fetch Google userinfo
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
anyhow = "1"
thiserror = "2"
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

## 3. Module layout (mirror the house engine)

```text
services/api/
├── Cargo.toml
├── migrations/                 # *.sql — applied on boot via sqlx::migrate!
│   └── 0001_init.sql
└── src/
    ├── main.rs                 # entry: env, AppState, CORS, migrate-on-boot, serve
    ├── api/                    # Axum route handlers
    │   ├── mod.rs
    │   ├── auth.rs             # /api/auth/* — register, login, google, google/callback, me
    │   └── middleware.rs       # JWT extraction; create_token
    ├── db/                     # SQLx queries (users, ...)
    │   ├── mod.rs
    │   └── users.rs
    ├── models/                 # shared types / DTOs
    │   └── mod.rs
    └── services/               # business logic + error type
        └── error.rs
```

## 4. main.rs — boot sequence

The boot order that matters: load env → build the Postgres pool → **run migrations** →
build the router with CORS + shared state → bind and serve. Migrations on boot means the
schema is always current; there's no separate migrate step.

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt().with_env_filter("info").init();

    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;   // schema = migrations, applied here

    let state = AppState { db, jwt_secret: std::env::var("AUTH_SECRET")? /* ...google cfg... */ };
    let app = build_router(state);                    // mount /api/auth/* etc. + CORS layer

    let listener = tokio::net::TcpListener::bind("0.0.0.0:7890").await?;
    tracing::info!("api listening on :7890");
    axum::serve(listener, app).await?;
    Ok(())
}
```

CORS: allow `http://localhost:5005` (web) + anything in `CORS_ORIGINS`, methods + the
`Authorization` header, via `tower_http::cors::CorsLayer`.

## 5. First migration — `migrations/0001_init.sql`

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT,                       -- NULL for Google-only accounts
    google_sub    TEXT UNIQUE,               -- Google subject id, NULL for password-only
    name          TEXT,
    avatar_url    TEXT,
    role          TEXT NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users (email);
```

Add product tables (from the PRD) as later numbered migrations. Keep migrations append-only.

## 6. Auth — roll-your-own JWT

The backend is the source of truth for identity. Two entry paths, one token.

### Token helpers (`api/middleware.rs`)

- `create_token(user_id, role, secret) -> String` — sign a JWT (jsonwebtoken) with claims
  `{ sub, role, exp }`, e.g. 7-day expiry.
- An Axum extractor `AuthUser` that pulls the `Authorization: Bearer` header, decodes +
  validates the JWT, and yields the user id (reject with 401 on failure). Handlers that need
  auth take `AuthUser` as an argument.

### Email / password (`api/auth.rs`)

- `POST /api/auth/register` — validate email + password, `bcrypt::hash` the password, insert
  the user, return `{ token, user }`.
- `POST /api/auth/login` — look up by email, `bcrypt::verify`, return `{ token, user }` or 401.
- `GET /api/auth/me` — `AuthUser` → return the current user. (How the frontends hydrate.)

```rust
// register (sketch — adapt to current axum/sqlx API)
async fn register(State(s): State<AppState>, Json(b): Json<RegisterReq>)
    -> Result<Json<AuthResp>, AppError> {
    let hash = bcrypt::hash(&b.password, bcrypt::DEFAULT_COST)?;
    let user = db::users::create_password_user(&s.db, &b.email, &hash, b.name).await?;
    let token = create_token(user.id, &user.role, &s.jwt_secret)?;
    Ok(Json(AuthResp { token, user }))
}
```

### Sign in with Google (OAuth authorization-code flow)

- `GET /api/auth/google` — build the Google consent URL (scopes `openid email profile`) with
  `GOOGLE_CLIENT_ID` + `GOOGLE_REDIRECT_URI` and 302-redirect to it. Use a `state` param to
  guard CSRF.
- `GET /api/auth/google/callback?code=...` — exchange the code for tokens (`oauth2` crate),
  call Google's userinfo endpoint (`reqwest`) to get `{ sub, email, name, picture }`,
  **upsert** the user by `google_sub` (or link to an existing email), mint your own JWT, and
  redirect back to the web app with the token (or return JSON for the native flow).

The key idea: Google authenticates the human; **you** issue the session token. The frontends
never see Google secrets — they only ever hold your JWT.

> Security defaults to carry over: never log secrets or tokens; keep `AUTH_SECRET` strong and
> only in env; validate/normalize emails; rate-limit auth endpoints; and treat the DB as the
> source of truth for `role` (re-check on protected admin routes, don't trust the JWT claim
> blindly for privilege escalation).

## 7. db/ scripts (TS, repo root)

`db/seed.ts` and `db/prune.ts` use the `pg` node driver against `DATABASE_URL` (run via
`tsx`, wired in the root `package.json`). Seed a dev admin user and any reference data;
prune handles retention/cleanup. These complement — they don't replace — the SQLx migrations.

## 8. Verify it boots

`docker compose up -d db` (template in `assets/docker-compose.yml`), set `DATABASE_URL`,
then `cargo run`. Confirm migrations apply and `GET /api/auth/me` returns 401 without a
token and 200 with one. If you can't run Postgres in this environment, at least get
`cargo check` clean and document the run steps.
