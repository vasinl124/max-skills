# Scaffold — Frontend (Web + Mobile)

Scaffold the Next.js web app and the Expo React Native app. **Verify every command and
flag against current docs first** (context7: `next.js`, `react`, `tailwindcss`, `shadcn`,
`expo`) — these tools change their CLIs often and your training data is stale.

Both apps are **thin clients** over the Rust API. No business logic here. Auth = store the
JWT the backend issues and send it as `Authorization: Bearer <jwt>`.

---

## Web — `apps/web` (Next.js, App Router)

### 1. Create the app

```bash
# from repo root — verify flags against current Next.js docs first.
# Passing any flag puts create-next-app into non-interactive mode.
pnpm create next-app@latest apps/web \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" \
  --use-pnpm --no-git --yes
```

Use the current stable major (Next.js 16 as of writing) unless the user asks otherwise. The
default template gives you TypeScript, Tailwind v4, ESLint, the App Router, Turbopack, and
the `@/*` import alias.

Set the package name in `apps/web/package.json` to `<project>-web` and aim the dev script at
the house port (5005). Next.js 16 removed `next lint` and `next build` no longer lints, so
the quality gate is `tsc --noEmit` for types with ESLint run directly:

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

`next typegen` regenerates the typed-routes definitions so `tsc --noEmit` sees them; on an
older Next major it's a no-op you can drop. Verify the current lint/type-check story via
context7 (`next.js`) — the CLI surface moves.

### 2. Design tokens + shadcn/ui

- Put the brand tokens from `references/branding.md` / `assets/globals.tokens.css` in
  `apps/web/src/app/globals.css` (create-next-app already imports it from the root layout).
- Server Components are the default. Add `"use client"` only to components that need
  interactivity (forms, toggles, anything using hooks or `localStorage`) — don't turn the
  whole web app into one giant client component.
- Init shadcn/ui using its current Next.js flow and add the primitives you'll need first
  (button, card, input, label, dropdown-menu, etc.). Verify the flow via context7
  (`shadcn`) before running it; shadcn changes its CLI/config layout often.
- Add a theme provider (e.g. `next-themes`) in a client component that toggles the `.dark`
  class, and a density toggle if the brand calls for it.

### 3. The API client (`src/lib/api.ts`)

A small typed `fetch` wrapper is the single way the app talks to the backend. It should:
read `NEXT_PUBLIC_API_URL`, attach the JWT from `localStorage` as a Bearer header for
client-side calls, parse JSON, and throw typed errors. Next.js only exposes `NEXT_PUBLIC_*`
environment variables to browser code.

```ts
// apps/web/src/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7890";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}
```

This wrapper is for **client components** (it reads `localStorage`). If you need
authenticated data in a Server Component or route handler, store the JWT in a cookie and
read it server-side instead — don't reach for `localStorage` on the server.

### 4. Auth pages

Create App Router routes `src/app/login/page.tsx` and `src/app/signup/page.tsx`, each
rendering a small `"use client"` form component. Email/password posts to the backend's
`/api/auth/register` and `/api/auth/login`; on success store the returned JWT and redirect.
Add a **"Sign in with Google"** button that kicks off the backend OAuth flow (see
`scaffold-backend.md` — the web just links to `/api/auth/google` and handles the callback
that returns a JWT). Protect app routes with Next.js `middleware.ts` and/or a client-side
guard that checks for the token.

If you add anything under `src/app/api/*` (route handlers) or use server actions, keep them
as **thin proxies** to the Rust API — never put authoritative or stateful logic there.

### 5. Suggested structure

```text
apps/web/src/
├── app/
│   ├── layout.tsx           # root layout; imports ./globals.css
│   ├── globals.css          # brand design tokens
│   ├── page.tsx             # home
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── (app)/               # the actual product routes (from the PRD), guarded
│   └── api/                 # OPTIONAL: thin BFF route handlers → proxy to Rust
├── components/
│   ├── layout/              # nav, shell, mode-toggle
│   ├── ui/                  # shadcn primitives
│   ├── LoginForm.tsx        # "use client"
│   └── SignupForm.tsx       # "use client"
├── lib/
│   ├── api.ts
│   └── auth.ts              # token storage + current-user helpers
└── middleware.ts            # route protection
```

---

## Mobile — `apps/mobile` (Expo / React Native)

Only scaffold this if mobile is in scope. Use **Expo** with **Expo Router** (file-based
routing, the modern default). Verify the create command via context7 (`expo`):

### 1. Create the app

```bash
# from repo root — verify against current Expo docs
pnpm create expo apps/mobile
```

Set the package name to `<project>-mobile`. The root `dev:mobile` script runs
`pnpm --filter <project>-mobile start` (Expo dev server on 8081).

### 2. Config

- Set app name, slug, and a bundle/package id derived from the project slug (e.g.
  `com.<org>.<project>`) in `app.json` / `app.config.ts`.
- Read the API base from `EXPO_PUBLIC_API_URL` (Expo exposes `EXPO_PUBLIC_*` to the app).

### 3. Shared concerns

- **Design tokens**: reuse the brand palette as a `theme.ts` (or import from
  `packages/shared`). Track OS light/dark via `useColorScheme()`.
- **API client**: mirror the web `api()` wrapper, but store the JWT in
  `expo-secure-store` (not localStorage). Same Bearer-header pattern.
- **Auth screens**: login / signup posting to the same backend endpoints. For Sign in with
  Google on native, use Expo's auth session / Google auth flow and exchange the result for a
  backend JWT — verify the current Expo auth approach via context7 before implementing.

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

Keep the web and mobile clients consistent: same endpoints, same auth model, same brand.
