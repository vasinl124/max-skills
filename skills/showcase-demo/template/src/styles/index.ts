import type { FC } from "react";
import { Caption, Chip, type CaptionProps, type ChipProps } from "../parts";
import { SCENES, type SceneComponent } from "../scenes";
import type { Enter, Scene } from "../types";
import { clean } from "./clean";

// The background tones a scene asks its style for. stage is the brand's stage colour (default: accent).
export type Tone = "paper" | "ink" | "accent" | "stage";

// A style: the look a showcase wears, picked by `style` in showcase.json. Only Backdrop is required; the
// rest falls back to clean's defaults and the scenes in scenes/index.ts. To add one, write
// styles/<name>.tsx exporting a Style, list it in STYLES, and render the Sampler composition to see it
// beside the others.
export type Style = {
  // the background of every scene, in the tone it asks for; quiet: a flat fill (title cards)
  Backdrop: FC<{ tone: Tone; quiet?: boolean }>;
  enter?: Partial<Record<Scene["type"], Enter>>; // how each kind of scene arrives by default
  scenes?: Partial<Record<Scene["type"], SceneComponent>>; // replace a scene's drawing outright
  Caption?: FC<CaptionProps>;
  Chip?: FC<ChipProps>;
};

export const STYLES: Record<string, Style> = { clean };

export type ResolvedStyle = Required<Omit<Style, "scenes">> & { scenes: Record<Scene["type"], SceneComponent> };

export function resolveStyle(name = "clean"): ResolvedStyle {
  const style = STYLES[name];
  if (!style) throw new Error(`No style "${name}" in styles/index.ts; there are: ${Object.keys(STYLES).join(", ")}`);
  return {
    Backdrop: style.Backdrop,
    enter: { ...clean.enter, ...style.enter },
    scenes: { ...SCENES, ...style.scenes },
    Caption: style.Caption ?? Caption,
    Chip: style.Chip ?? Chip,
  };
}
