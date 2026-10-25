# Branding & Design System

Produce a **written** design system (no image generation): a `docs/BRANDING.md` document plus
the concrete design tokens the web app codes against. It must be specific enough that Phase 5
can wire it straight into `globals.css` and the mobile theme.

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
A short paragraph naming the aesthetic (e.g. "editorial: high-contrast, monospace-accented"
or "warm and tactile: rounded corners, soft shadows, light-first"). Light + dark themes both
supported by default. Mention density (comfortable vs compact) if relevant.

## Logo direction
Written direction only (no asset generation here): wordmark vs mark, shape language, the
one memorable detail. Enough for a designer or a later image-gen pass to execute.
```

## Design tokens → globals.css

Translate the palette into CSS custom properties for the web app, starting from
`assets/globals.tokens.css`. The pattern: tokens on `:root` (light), overrides under `.dark`
(dark). **Never hardcode brand hexes in components**; always reference a token, so a rebrand is a
one-file change.

Wire-up in `apps/web` (Tailwind v4 is configured in CSS, via `@theme`):

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

Check Tailwind's current theming syntax in its docs before writing; the CSS-first config and its
directives keep evolving.

## Sharing tokens with mobile

Keep the same palette in the Expo app: either a small `theme.ts` with the same hex values as TS
constants in `apps/mobile`, or, if you created `packages/shared`, export the tokens once from
there and import them in both. Light/dark should follow the OS appearance via `useColorScheme()`.

## shadcn/ui

The web app uses shadcn/ui primitives. Run shadcn's init **before** applying the brand, because
it writes its own token set into `globals.css`. Then set those variables to the brand palette,
keeping every one it creates (its components reference `--popover`, `--secondary`,
`--destructive` and more), and add the extras from `assets/globals.tokens.css` (success,
warning, info). Check the current init flow in shadcn's docs first; its CLI and registry change
often.
