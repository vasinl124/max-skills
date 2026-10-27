import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useShowcase } from "../parts";
import type { Style, Tone } from ".";

// clean: flat brand colours, each with a soft light drifting across it so no frame ever looks frozen.
// Screens slide up into place; everything else fades.
function Backdrop({ tone, quiet }: { tone: Tone; quiet?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand } = useShowcase();
  const { paper, accent } = brand.colors;
  const color = tone === "stage" ? (brand.colors.stage ?? accent) : brand.colors[tone];
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

export const clean: Style = { Backdrop, enter: { screen: "slide" } };
