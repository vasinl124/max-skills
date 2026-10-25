# Scaffold — Frontend (Web + Mobile)

Scaffold the Next.js web app and the Expo app. **Check every command and flag against current
docs first** (the official sites, or a docs tool such as the context7 MCP): these CLIs change
often and your training data is stale.

Both apps are **thin clients** over the Rust API, with no business logic. Sessions are the API's
job (`references/scaffold-backend.md`, section 6): the web app rides an HttpOnly cookie it never
touches, and the mobile app keeps a bearer token in the device's secure storage.

---

## Web: `apps/web` (Next.js, App Router)

### 1. Create the app

```bash
# from repo root; check the flags against current Next.js docs first.
# Passing any flag puts create-next-app into non-interactive mode.
pnpm create next-app@latest apps/web \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" \
  --use-pnpm --no-git --yes
```

Use the current stable major unless the user asks otherwise. The default template gives you
TypeScript, Tailwind, ESLint, the App Router, Turbopack and the `@/*` import alias.

Set the package name in `apps/web/package.json` to `<project>-web` and point the scripts at your
web port (5005 by default). Next.js 16 removed `next lint`, and `next build` no longer lints, so
the quality gate is `tsc --noEmit` for types plus ESLint run directly:

```jsonc
{
  "name": "<project>-web",
  "private": true,
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 5005",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 5005",
    "check": "next typegen && tsc --noEmit",
    "lint": "eslint ."
  }
}
```

`next typegen` regenerates the typed-route definitions so `tsc --noEmit` sees them; on an older
Next major it doesn't exist, so drop it there.

### 2. Design tokens + shadcn/ui

- Run shadcn's init first, then apply the brand to the variables it writes in
  `apps/web/src/app/globals.css` (see `references/branding.md`). create-next-app already imports
  that file from the root layout.
- Server Components are the default. Add `"use client"` only to components that need
  interactivity (forms, toggles, anything using hooks); don't turn the whole app into one big
  client component.
- Add a theme provider (e.g. `next-themes`) in a client component that toggles the `.dark` class,
  and a density toggle if the brand calls for it.

### 3. The API client (`src/lib/api.ts`)

One small typed `fetch` wrapper is the only way the browser talks to the backend.
`credentials: "include"` makes the browser send the session cookie; the page never reads or
stores a token. Next.js only exposes `NEXT_PUBLIC_*` variables to browser code.

```ts
// apps/web/src/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7890";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include", // send the HttpOnly session cookie
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? res.statusText);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
```

Server Components and route handlers run on the server, where there's no browser cookie jar.
Forward the incoming cookie yourself, `headers: { cookie: (await cookies()).toString() }` with
`cookies` from `next/headers`, and pass `cache: "no-store"` for per-user data.

### 4. Auth pages and the route guard

- `src/app/login/page.tsx` and `src/app/signup/page.tsx`, each rendering a small `"use client"`
  form that posts JSON through `api()` to `/api/auth/login` or `/api/auth/register`, then
  `router.push()`es into the app. The cookie arrives with the response, so there's nothing to
  store.
- **Sign in with Google** is a plain link to `${NEXT_PUBLIC_API_URL}/api/auth/google`, a full-page
  navigation. The API sets the cookie and sends the browser back to `WEB_ORIGIN`.
- **Log out**: `api("/api/auth/logout", { method: "POST" })`, then route to `/login`.
- **Route guard**: `src/proxy.ts`. Next.js 16 renamed `middleware.ts` to `proxy.ts`; on an older
  major, use `middleware.ts` with a `middleware` export. It can only check that a session cookie
  exists, which makes it an optimistic redirect for UX. The API's 401 is the real gate.

```ts
// apps/web/src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = { matcher: ["/dashboard/:path*", "/settings/:path*"] }; // your guarded routes
```

The guard can see the cookie because cookies ignore ports: in dev, a cookie the API sets on
`localhost:7890` is sent to `localhost:5005` too. In production, serve web and API from one host,
or set `COOKIE_DOMAIN` to their shared parent domain.

Anything you add under `src/app/api/*` (route handlers) or as server actions stays a **thin
proxy** to the Rust API; never put authoritative or stateful logic there.

### 5. Suggested structure

```text
apps/web/src/
├── app/
│   ├── layout.tsx           # root layout; imports ./globals.css
│   ├── globals.css          # brand design tokens
│   ├── page.tsx             # home
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── dashboard/           # the product's routes (from the PRD), guarded by proxy.ts
│   └── api/                 # OPTIONAL: thin route handlers that proxy to Rust
├── components/
│   ├── layout/              # nav, shell, mode toggle
│   ├── ui/                  # shadcn primitives
│   ├── LoginForm.tsx        # "use client"
│   └── SignupForm.tsx       # "use client"
├── lib/
│   ├── api.ts
│   └── auth.ts              # current-user helpers (calls /api/auth/me)
└── proxy.ts                 # optimistic route guard
```

---

## Mobile: `apps/mobile` (Expo / React Native)

Only scaffold this if mobile is in scope. Use **Expo** with **Expo Router** (file-based routing,
the modern default), and check the create command in Expo's docs.

### 1. Create the app

```bash
# from repo root; check against current Expo docs
pnpm create expo apps/mobile
```

Set the package name to `<project>-mobile`. The root `dev:mobile` script runs
`pnpm --filter <project>-mobile start` (the Expo dev server, on 8081).

### 2. Config

- Set the app name, slug, and a bundle/package id derived from the project slug (e.g.
  `com.<org>.<project>`) in `app.json` / `app.config.ts`.
- Read the API base from `EXPO_PUBLIC_API_URL` (Expo exposes `EXPO_PUBLIC_*` to the app).
  `localhost` only works in the iOS simulator: a physical device needs your machine's LAN IP, and
  the Android emulator `10.0.2.2`.

### 3. Shared concerns

- **Design tokens**: the brand palette as `lib/theme.ts` (or imported from `packages/shared`).
  Follow the OS light/dark setting with `useColorScheme()`.
- **API client**: mirror the web `api()` wrapper, but keep the token in `expo-secure-store` (never
  AsyncStorage), send `Authorization: Bearer <token>`, and send `X-Client: mobile` on the auth
  calls so the API returns the token instead of setting a cookie.
- **Auth screens**: login / signup posting to the same backend endpoints.
- **Sign in with Google**: use the native Google Sign-In SDK (e.g.
  `@react-native-google-signin/google-signin`, which needs a development build rather than Expo
  Go), configured with the **web** client ID so the ID token is issued for `GOOGLE_CLIENT_ID`.
  Post the ID token to `/api/auth/google/native` and store the token that comes back. Check Expo's
  current Google sign-in guide before implementing.

### 4. Suggested structure

```text
apps/mobile/
├── app/                     # Expo Router routes
│   ├── (auth)/login.tsx
│   ├── (auth)/signup.tsx
│   └── (tabs)/...           # main app
├── components/
├── lib/
│   ├── api.ts               # Bearer wrapper, token via expo-secure-store
│   └── theme.ts             # brand tokens
└── app.json
```

Keep the web and mobile clients consistent: same endpoints, same brand, and the same sessions
from the same API.
