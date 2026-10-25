# Scaffold — Backend (Rust + Axum + SQLx + Auth)

The authoritative service: Rust (edition 2024), Axum, SQLx for async Postgres (no ORM), and auth
built in, with bcrypt email/password **and** Sign in with Google. The API issues every session.

The Rust snippets were checked against axum 0.8, axum-extra 0.12, tower-http 0.7,
jsonwebtoken 11, oauth2 5 and sqlx 0.8. Crate APIs move, so check current docs (docs.rs) and adapt if `cargo add`
resolves newer majors. **The security rules in section 6 hold whatever the version**; keep every
one of them.

## 1. Create the crate

```bash
mkdir -p services/api && cd services/api
cargo init --name api
```

The root `dev:api` script already points here with its own `CARGO_TARGET_DIR` (see
`references/conventions.md`).

## 2. Dependencies

Add them with `cargo add`, which records the newest versions your toolchain supports instead of
stale pins:

```bash
cargo add axum axum-extra tokio tower-http serde serde_json sqlx jsonwebtoken bcrypt oauth2 \
  uuid chrono time anyhow thiserror dotenvy tracing tracing-subscriber \
  --features axum-extra/cookie,tokio/full,tower-http/cors,tower-http/trace,serde/derive,jsonwebtoken/aws_lc_rs,sqlx/runtime-tokio,sqlx/tls-rustls,sqlx/postgres,sqlx/macros,sqlx/migrate,sqlx/uuid,sqlx/chrono,uuid/v4,uuid/serde,chrono/serde,tracing-subscriber/env-filter
```

- `jsonwebtoken` 10+ needs exactly one crypto backend feature (`aws_lc_rs` or `rust_crypto`).
  With neither, the first sign or verify panics at runtime.
- `oauth2` brings its own `reqwest` and re-exports it as `oauth2::reqwest`. Make the Google calls
  with that client rather than adding `reqwest` yourself; two reqwest majors don't interoperate.
- If `cargo add` warns that it skipped a newer version because of your `rustc`, suggest
  `rustup update`.
- Storing money? Add `rust_decimal` and the `sqlx/rust_decimal` feature.

## 3. Module layout

```text
services/api/
├── Cargo.toml
├── migrations/                 # *.sql, applied on boot via sqlx::migrate!
│   └── 0001_init.sql
└── src/
    ├── main.rs                 # env, AppState, CORS, migrate-on-boot, serve
    ├── api/                    # Axum route handlers
    │   ├── mod.rs
    │   ├── auth.rs             # /api/auth/*: register, login, logout, me, google, google/callback, google/native
    │   └── session.rs          # JWT create/verify, the session cookie, the AuthUser extractor
    ├── db/                     # SQLx queries
    │   ├── mod.rs
    │   └── users.rs            # includes the Google linking rule (section 6)
    ├── models/                 # shared types / DTOs
    │   └── mod.rs
    └── services/               # business logic + the error type
        └── error.rs
```

## 4. main.rs: boot sequence

Load env → refuse a weak secret → build the Postgres pool → **run migrations** → build the router
with CORS and shared state → bind and serve. Migrating on boot keeps the schema current with no
separate step.

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt().with_env_filter("info").init();

    let jwt_secret = std::env::var("JWT_SECRET")?;
    anyhow::ensure!(jwt_secret.len() >= 32, "JWT_SECRET must be 32+ bytes: openssl rand -base64 48");

    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;   // schema = migrations, applied here

    let state = AppState { db, jwt_secret /* , web_origin, cookie_domain, google config */ };
    let app = build_router(state);                    // /api/auth/* etc. + the CORS layer below

    let listener = tokio::net::TcpListener::bind("0.0.0.0:7890").await?;   // your API port
    axum::serve(listener, app).await?;
    Ok(())
}
```

Binding `0.0.0.0` lets a phone on your network reach the dev API; bind `127.0.0.1` if you don't
need that. Read `COOKIE_DOMAIN` as unset when it's empty.

CORS: the browser sends the session cookie, so allow exactly `WEB_ORIGIN`, with credentials
(never `*`):

```rust
use axum::http::{header, HeaderValue, Method};

let cors = tower_http::cors::CorsLayer::new()
    .allow_origin(web_origin.parse::<HeaderValue>()?)
    .allow_credentials(true)
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
    .allow_headers([header::CONTENT_TYPE]);
```

## 5. First migration: `migrations/0001_init.sql`

```sql
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL,                  -- stored trimmed + lowercased
    email_verified BOOLEAN NOT NULL DEFAULT false, -- password signups stay false until you verify them
    password_hash  TEXT,                           -- NULL for Google-only accounts
    google_sub     TEXT UNIQUE,                    -- Google's stable user id; NULL for password-only
    name           TEXT,
    avatar_url     TEXT,
    role           TEXT NOT NULL DEFAULT 'USER',
    token_version  INTEGER NOT NULL DEFAULT 0,     -- bump to revoke every session the user has
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One account per email, whatever the case.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
```

Query users by `lower(email) = lower($1)` so the index is used. Add the product's tables (from the
PRD) as later numbered migrations, and keep migrations append-only.

## 6. Auth

The backend owns identity: two ways in (password, Google), one session token, delivered the way
each client can keep it safe.

### Sessions

- The session is a JWT (HS256, signed with `JWT_SECRET`) with claims
  `{ sub: user id, ver: token_version, exp }` and a 7-day expiry. No role in it: the role comes
  from the database.
- **Web**: the API sets the token as a cookie named `session`: `HttpOnly` (page scripts can't read
  it, so an XSS bug can't steal it), `SameSite=Lax`, `Path=/`, `Max-Age` matching the token,
  `Secure` when `WEB_ORIGIN` is https, and `Domain=COOKIE_DOMAIN` when that's non-empty. The token
  never goes in a URL, and never in a response body the browser can read.
- **Mobile**: native apps send `X-Client: mobile`. For them the auth endpoints return
  `{ token, user }` in the body instead of setting a cookie, and the app sends
  `Authorization: Bearer <token>`.
- **Revocation**: bump `token_version` and every outstanding session of that user dies. Do it on
  password change and on "sign out everywhere". (Per-device logout needs a sessions table; add one
  when the product needs it.)

```rust
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};

fn session_cookie(token: String, web_origin: &str, cookie_domain: Option<&str>) -> Cookie<'static> {
    let mut c = Cookie::build(("session", token))
        .http_only(true)
        .secure(web_origin.starts_with("https://"))
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::days(7));   // match the JWT's exp
    if let Some(d) = cookie_domain {
        c = c.domain(d.to_owned());
    }
    c.build()
}
// in a handler: Ok((jar.add(session_cookie(token, &s.web_origin, s.cookie_domain.as_deref())), Json(user)))
```

The `AuthUser` extractor accepts either transport, and checks the version on every request:

```rust
pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;   // renders as 401
    async fn from_request_parts(parts: &mut Parts, s: &AppState) -> Result<Self, Self::Rejection> {
        let bearer = parts.headers.get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::to_owned);
        let token = bearer
            .or_else(|| CookieJar::from_headers(&parts.headers).get("session").map(|c| c.value().to_owned()))
            .ok_or(AppError::Unauthorized)?;
        let key = DecodingKey::from_secret(s.jwt_secret.as_bytes());
        let claims = decode::<Claims>(&token, &key, &Validation::new(Algorithm::HS256))
            .map_err(|_| AppError::Unauthorized)?
            .claims;
        let user = db::users::find_by_id(&s.db, claims.sub).await?.ok_or(AppError::Unauthorized)?;
        if user.token_version != claims.ver {
            return Err(AppError::Unauthorized);   // revoked
        }
        Ok(AuthUser(user))
    }
}
```

Handlers that need a signed-in user take `AuthUser`. It already holds the row, so check `role` on
it for admin routes, and never trust a token claim for privilege.

**CSRF.** Cookie auth has to handle it. `SameSite=Lax` keeps the cookie off cross-site POSTs. The
CORS allow-list stops other origins reading responses or sending JSON. And every state-changing
endpoint takes a JSON body: Axum's `Json` extractor answers form, text and multipart posts with
415, so a forged HTML form can't reach them. So: no endpoint changes state on GET, and none
accepts a form-encoded body.

### Email / password

- `POST /api/auth/register`: trim and lowercase the email, require a password of 8–72 bytes, hash
  it with `bcrypt::non_truncating_hash` (plain `hash` silently ignores bytes past 72), then
  **insert** the user and issue the session. An existing email gets a 409: register never updates
  an existing row. New accounts start with `email_verified = false`.
- `POST /api/auth/login`: look up by `lower(email)`, `bcrypt::verify`, issue the session. Unknown
  email, Google-only account and wrong password all get the same 401.
- `POST /api/auth/logout`: `jar.remove(Cookie::build("session").path("/"))`, with the same path and
  domain as when the cookie was set. Mobile just deletes its stored token.
- `GET /api/auth/me`: `AuthUser` → the current user. This is how both apps hydrate.

### Sign in with Google: web (authorization-code flow with PKCE)

- `GET /api/auth/google`: make a random `state` and a PKCE verifier. Store `state.verifier` in a
  short-lived cookie (`oauth`: HttpOnly, **`SameSite=Lax`**, `Path=/api/auth/google`, 10 minutes;
  `Strict` would not come back on Google's redirect). Then 302 to Google's consent screen with
  scopes `openid email profile`, the `state` and the S256 code challenge.
- `GET /api/auth/google/callback?code&state`: reject unless `state` matches the cookie, then clear
  the cookie. Exchange the code **with the verifier**, fetch the userinfo
  (`https://openidconnect.googleapis.com/v1/userinfo`) with the access token, apply the linking
  rule, set the session cookie, and 302 to `WEB_ORIGIN`. That target is fixed from env: never read
  it from the query string (an open redirect), and never put the token in it.

```rust
use oauth2::{basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl, Scope, TokenUrl};

let google = BasicClient::new(ClientId::new(client_id))
    .set_client_secret(ClientSecret::new(client_secret))
    .set_auth_uri(AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".into())?)
    .set_token_uri(TokenUrl::new("https://oauth2.googleapis.com/token".into())?)
    .set_redirect_uri(RedirectUrl::new(redirect_uri)?);

// GET /api/auth/google
let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
let (url, state) = google
    .authorize_url(CsrfToken::new_random)
    .add_scope(Scope::new("openid".into()))
    .add_scope(Scope::new("email".into()))
    .add_scope(Scope::new("profile".into()))
    .set_pkce_challenge(challenge)
    .url();
// set the `oauth` cookie to format!("{}.{}", state.secret(), verifier.secret()), then redirect to `url`

// GET /api/auth/google/callback, once `state` has been checked
let http = oauth2::reqwest::Client::builder()
    .redirect(oauth2::reqwest::redirect::Policy::none())   // oauth2's advice: don't follow redirects
    .build()?;
let token = google
    .exchange_code(oauth2::AuthorizationCode::new(code))
    .set_pkce_verifier(oauth2::PkceCodeVerifier::new(verifier_from_cookie))
    .request_async(&http)
    .await?;
// GET the userinfo with .bearer_auth(token.access_token().secret()) (needs `use oauth2::TokenResponse`),
// then serde_json::from_slice(&res.bytes().await?) into GoogleIdentity
```

### Sign in with Google: native

The mobile app gets a Google **ID token** from the platform's Google Sign-In SDK and posts it to
`POST /api/auth/google/native` as `{ id_token }`. Verify it yourself, apply the linking rule, and
return `{ token, user }`:

- the signature against Google's keys (`https://www.googleapis.com/oauth2/v3/certs`; cache the set
  and refetch it once when a `kid` is missing, since Google rotates them);
- `alg` RS256 only; `iss` is `accounts.google.com` or `https://accounts.google.com`; `aud` is your
  web client ID (`GOOGLE_CLIENT_ID`, which the app passes to the SDK), plus your iOS or Android
  client ID if that platform's tokens carry it; `exp` in the future;
- `aud`, `iss`, `exp` and `sub` all required. jsonwebtoken only requires `exp` by default.

```rust
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};

#[derive(serde::Deserialize)]
struct GoogleIdentity { sub: String, email: String, email_verified: bool, name: Option<String>, picture: Option<String> }

fn verify_google_id_token(id_token: &str, jwks: &JwkSet, client_id: &str) -> anyhow::Result<GoogleIdentity> {
    let kid = decode_header(id_token)?.kid.ok_or_else(|| anyhow::anyhow!("token has no kid"))?;
    let jwk = jwks.find(&kid).ok_or_else(|| anyhow::anyhow!("unknown signing key"))?;
    let mut v = Validation::new(Algorithm::RS256);
    v.set_audience(&[client_id]);
    v.set_issuer(&["accounts.google.com", "https://accounts.google.com"]);
    v.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    Ok(decode::<GoogleIdentity>(id_token, &DecodingKey::from_jwk(jwk)?, &v)?.claims)
}
```

### The linking rule (both Google paths)

Linking a Google login to an existing account by email is where account takeovers happen. An
attacker signs up with the victim's address and a password of their choosing; the victim later
uses "Sign in with Google"; an unguarded link drops the victim into an account the attacker can
still open. So:

1. Google says `email_verified` is false → refuse.
2. A user with this `google_sub` exists → sign them in.
3. A user with this email exists and has no `google_sub` → link it. If that account's email was
   never verified, nothing proves its password belongs to the email's owner: drop the password and
   bump `token_version`, which kills any session minted for it. Then mark the email verified.
4. Otherwise create the user with `email_verified = true` and no password.

An email already linked to a *different* Google account matches neither step 2 nor step 3, so the
insert in step 4 hits the unique index. Answer 409; never relink.

```sql
-- step 3 as one statement ($1 sub, $2 email, $3 name, $4 picture); SET reads the pre-update row
UPDATE users SET
    google_sub     = $1,
    password_hash  = CASE WHEN email_verified THEN password_hash END,
    token_version  = token_version + CASE WHEN email_verified THEN 0 ELSE 1 END,
    email_verified = true,
    name           = COALESCE(name, $3),
    avatar_url     = COALESCE(avatar_url, $4)
WHERE lower(email) = lower($2) AND google_sub IS NULL
RETURNING *;
```

### Security defaults

- Never log secrets, passwords or tokens, and never put a token in a URL.
- Rate-limit `/api/auth/*` (the `tower_governor` crate, for example).
- Before launch, add email verification and password reset. Until then, password signups stay at
  `email_verified = false`, which is exactly what the linking rule relies on.

## 7. A dev admin

No seed script needed: sign up through the app, then promote yourself with
`psql "$DATABASE_URL" -c "UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com'"`. Never
ship a default admin account or password.

## 8. Verify it boots

`docker compose up -d --wait db` (template in `assets/docker-compose.yml`), fill in `.env`, then
`cargo run`. Confirm the migrations apply, then smoke-test the auth, using your ports:

```bash
API=http://localhost:7890 WEB=http://localhost:5005 JAR=$(mktemp)
curl -s -o /dev/null -w '%{http_code}\n' $API/api/auth/me                                # 401
curl -s -c $JAR -o /dev/null -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"smoke-test-password"}' $API/api/auth/register
grep -c '^#HttpOnly_' $JAR                                                                # 1: the cookie is HttpOnly
curl -s -b $JAR -o /dev/null -w '%{http_code}\n' $API/api/auth/me                       # 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: text/plain' -d x $API/api/auth/login   # 415
curl -s -i -X OPTIONS -H "Origin: $WEB" -H 'Access-Control-Request-Method: POST' $API/api/auth/login \
  | grep -i '^access-control-allow-credentials: true'                                    # prints the header
```

If Postgres can't run in this environment, at least get `cargo check` clean and write the run steps
down.
