import type { FC } from "react";
import { Callout, Caption, Chip, Kicker, type CalloutProps, type CaptionProps, type ChipProps, type KickerProps } from "../parts";
import { SCENES, type SceneComponent } from "../scenes";
import type { Brand, Enter, Scene } from "../types";
import { aura } from "./aura";
import { beams } from "./beams";
import { clean, surface as cleanSurface } from "./clean";
import { drafting } from "./drafting";

// The background tones a scene asks its style for. stage is the brand's stage colour (default: accent).
export type Tone = "paper" | "ink" | "accent" | "stage";

// What a scene draws with on a background of some tone: the ground itself, text and secondary text on it,
// the marker stroke under *starred* words (none: they stand out by colour alone), their colour and any glow
// behind them, and the colour of a hard edge on it (a window's offset shadow).
export type Surface = { ground: string; text: string; muted: string; mark?: string; em: string; glow?: string; edge: string };

// A style: the look a showcase wears, picked by `style` in showcase.json. Only Backdrop is required; the
// rest falls back to clean's, and to the scenes in scenes/index.ts. To add one, write styles/<name>.tsx
// exporting a Style, list it in STYLES, and render the Sampler composition to see it beside the others.
export type Style = {
  // the background of every scene, in the tone it asks for; quiet: a calmer version (title cards)
  Backdrop: FC<{ tone: Tone; quiet?: boolean }>;
  surface?: (tone: Tone, colors: Brand["colors"]) => Surface; // the colours on each tone (a dark style flips them)
  enter?: Partial<Record<Scene["type"], Enter>>; // how each kind of scene arrives by default
  scenes?: Partial<Record<Scene["type"], SceneComponent>>; // replace a scene's drawing outright
  Caption?: FC<CaptionProps>;
  Chip?: FC<ChipProps>;
  Kicker?: FC<KickerProps>;
  Callout?: FC<CalloutProps>;
};

export const STYLES: Record<string, Style> = { clean, beams, aura, drafting };

export type ResolvedStyle = Required<Omit<Style, "scenes">> & { scenes: Record<Scene["type"], SceneComponent> };

export function resolveStyle(name = "clean"): ResolvedStyle {
  const style = STYLES[name];
  if (!style) throw new Error(`No style "${name}" in styles/index.ts; there are: ${Object.keys(STYLES).join(", ")}`);
  return {
    Backdrop: style.Backdrop,
    surface: style.surface ?? cleanSurface,
    enter: { ...clean.enter, ...style.enter },
    scenes: { ...SCENES, ...style.scenes },
    Caption: style.Caption ?? Caption,
    Chip: style.Chip ?? Chip,
    Kicker: style.Kicker ?? Kicker,
    Callout: style.Callout ?? Callout,
  };
}
