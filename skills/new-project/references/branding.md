# Branding & Design System

Produce a **written** design system (no image generation): a `docs/BRANDING.md` document
plus the concrete design tokens the web app codes against. It must be specific enough that
Phase 5 can wire it straight into `globals.css` and the mobile theme.

## docs/BRANDING.md template

```markdown
# <Product> — Brand & Design System

## Name
The name and why it works (meaning, tone, memorability). If the user had no name, this is
where you propose 2–3 options and pick one with them.

## Positioning & personality
One line on positioning. Then 3–5 brand adjectives (e.g. "fast, playful, trustworthy")
that every design and copy decision should ladder up to.

## Voice & tone
How the product talks: casual vs formal, emoji or not, microcopy style. One or two
before/after examples (a generic line rewritten in-voice).

## Color
The palette with hex values and intent. At minimum:
- **Brand / primary** — the signature color (and why).
- **Accent(s)** — secondary lanes if the product needs them.
- **Neutrals** — background, surface, border, muted text scales (light AND dark).
- **Semantic** — success / warning / danger / info.
Note WCAG contrast for text-on-brand. State the light vs dark treatment.

## Typography
- **Sans** (UI / body) and **Mono** (numbers / code) families, with fallbacks.
- Prefer Google Fonts or system stacks so they're free and easy to self-host.
- Type scale + weights for headings vs body.

## Design language
A short paragraph naming the aesthetic (e.g. "Soft Play: light-first, pastel-playful" or
"editorial, high-contrast, monospace-accented"). Light + dark themes both supported by
default. Mention density (comfortable vs compact) if relevant.

## Logo direction
Written direction only (no asset generation here): wordmark vs mark, shape language, the
one memorable detail. Enough for a designer or a later image-gen pass to execute.
```

## Design tokens → globals.css

Translate the palette into CSS custom properties for the web app. Start from
`assets/globals.tokens.css` and replace the values with the brand's. The pattern: define
tokens on `:root` (light) and override under `.dark` (dark). **Never hardcode brand hexes
in components** — always reference the token, so a rebrand is a one-file change.

Wire-up in `apps/web` (Tailwind v4 uses CSS-first config via `@theme`):

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --primary: #7a6ff0;          /* <- brand color from BRANDING.md */
  --primary-foreground: #ffffff;
  --muted: #f4f4f5;
  --border: #e4e4e7;
  /* ...semantic + neutral scale... */
}

.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --primary: #8f86f3;
  /* ...dark overrides... */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ...expose tokens to Tailwind utilities... */
}
```

Confirm current Tailwind theming syntax via context7 (`tailwindcss`) before writing —
v4 moved config into CSS and the exact directives evolve.

## Sharing tokens with mobile

Keep the same palette in the Expo app. Either copy a small `theme.ts` (the same hex values
as TS constants) into `apps/mobile`, or — if you created `packages/shared` — export the
tokens once from there and import in both. Light/dark should track the OS appearance via
`useColorScheme()`.

## shadcn/ui

The web app uses shadcn/ui primitives. After scaffolding the web app, init shadcn and let
it read the CSS variables above so components inherit the brand. Verify the current shadcn
init flow via context7 (`shadcn`) — the CLI and registry change.
