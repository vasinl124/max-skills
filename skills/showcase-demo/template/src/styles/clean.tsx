import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useShowcase } from "../parts";
import type { Brand } from "../types";
import type { Style, Surface, Tone } from ".";

// clean: flat brand colours, each with a soft light drifting across it so no frame ever looks frozen.
// Screens slide up into place; everything else fades.

// The brand's colours as they are: ink on the light tones, paper on ink, with the accent as the marker
// stroke (paper on the accent itself). Every style without its own surface uses this one.
export const surface = (tone: Tone, c: Brand["colors"]): Surface => {
  const ground = tone === "stage" ? (c.stage ?? c.accent) : c[tone];
  if (ground === c.ink) return { ground, text: c.paper, muted: c.accent, em: c.accent, edge: c.accent };
  return { ground, text: c.ink, muted: c.muted, mark: ground === c.accent ? c.paper : c.accent, em: c.ink, edge: c.ink };
};

function Backdrop({ tone, quiet }: { tone: Tone; quiet?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand } = useShowcase();
  const { paper, accent } = brand.colors;
  const color = surface(tone, brand.colors).ground;
  if (quiet) return <AbsoluteFill style={{ background: color }} />;
  const light = color === paper ? accent : paper;
  const a = frame / fps / 5;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(55% 65% at ${50 + 20 * Math.sin(a)}% ${40 + 14 * Math.cos(a * 1.3)}%, color-mix(in oklab, ${light} 75%, transparent), transparent 75%), ${color}`,
      }}
    />
  );
}

export const clean: Style = { Backdrop, surface, enter: { screen: "slide" } };
