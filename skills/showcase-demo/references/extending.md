# Extending the template

The template is built from registries: styles, scenes, frames and formats. A new look or a new kind of scene is one file and one line, and works in every format.

## Styles (`src/styles/`)

A style is the look a showcase wears, picked by `"style"` in `showcase.json`: `clean` (the default), `rays`, `aura` or `drafting`.

```ts
export type Style = {
  Backdrop: FC<{ tone: Tone; quiet?: boolean }>;          // required: the background of every scene
  surface?: (tone: Tone, colors: Brand["colors"]) => Surface; // the colours drawn on each tone
  enter?: Partial<Record<Scene["type"], Enter>>;           // how each kind of scene arrives by default
  scenes?: Partial<Record<Scene["type"], SceneComponent>>; // redraw a kind of scene outright
  Caption?: FC<CaptionProps>;                              // the narration line under a take
  Chip?: FC<ChipProps>;                                    // the chapter chip
  Kicker?: FC<KickerProps>;                                // a chapter's small label above its words
  Callout?: FC<CalloutProps>;                              // what marks a callout's target and carries its text
};
```

Only `Backdrop` is required; the rest falls back to `clean`'s. A scene asks its `Backdrop` for a tone: `paper`, `ink`, `accent`, or `stage` (behind a take: the brand's `stage` colour, else the accent). Title cards pass `quiet` for a calmer version.

The scenes never pick colours themselves. They ask `useSurface(tone)` what to draw with on that tone: the `ground`, its `text` and `muted` text, the `mark` stroke under starred words (none: they stand out by colour), the starred words' colour `em` and any `glow` behind them, and the `edge` colour of a hard shadow. `clean`'s surface is the brand's colours as they are. `rays` returns a dark ground with paper text on every tone, which is all it takes to make every scene dark. A style can also dress the default chip and caption instead of redrawing them, by passing a `skin` of CSS, as `aura` does for its frosted glass.

To add a style:
1. Write `src/styles/<name>.tsx` exporting a `Style`.
2. List it in `STYLES` in `src/styles/index.ts`.
3. Render the sampler, which plays every style through the same few scenes in the storyboard's brand: `npx remotion render Sampler out/sampler.mp4`.

Then set `"style": "<name>"` in `showcase.json`.

## Scenes (`src/scenes/`)

Each kind of scene is a component in `SCENES` (`src/scenes/index.ts`), with its default length in `SECONDS`. It gets `scene` (its storyboard entry), `take` (a screen's take) and `chapter` (the kicker in force). To add a kind:
1. Add it to the `Scene` union in `src/types.ts`.
2. Write `src/scenes/<type>.tsx`.
3. List it in `SCENES` and `SECONDS`.

A style can redraw any kind of scene through its own `scenes`.

## Frames (`src/frames.tsx`)

A frame is how a 16:9 screen presents its take: `browser` (the default, with traffic lights and the address bar) or `card` (a plain rounded card). A scene picks one with `"frame"`. To add one, write its `Chrome` (`{ width, children }`) and list it in `FRAMES`, with `bar` set to the height of its chrome above the take. Reframed formats always show a card.

## Formats (`src/formats.ts`)

A format sets the frame's size, how big type runs against 16:9's, the side margin for text, the safe areas a feed's own buttons cover, and where the chip sits. With `reframe`, screens cut each take to a card around its action. To add a format, such as 4:5:
1. Add it to `Format` in `src/types.ts`.
2. Give it a `FormatSpec` in `FORMATS`.
3. Give it a composition id in `IDS` in `src/Root.tsx`.

## Rules for anything new

- Animate only from `useCurrentFrame()`, never with CSS transitions or animations.
- Take colours from the brand (`useShowcase().brand`), so every style works for every brand.
- Size type by `spec.type` and pad text by `spec.padX`, so it fits every format.
- Before calling it done, run `npx tsc --noEmit`, render the sampler, and look at stills in each format.
