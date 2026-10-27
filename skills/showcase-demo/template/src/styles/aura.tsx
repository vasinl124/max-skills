import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption, Chip, useShowcase, useSurface, type CaptionProps, type ChipProps } from "../parts";
import type { Style, Surface, Tone } from ".";

// aura: soft orbs of colour drifting and breathing over the brand's ground, like light through frosted
// glass. The orbs are the accent and its neighbours on the colour wheel; the chip and the captions sit on
// frosted glass, and screens fade in rather than slide.

// each orb: its hue turned from the accent's, where it drifts around (% of the frame), its size (% of the
// frame's longer side) and how many seconds one lap of its drift takes
const ORBS = [
  { hue: 0, x: 22, y: 28, size: 62, dx: 9, dy: 7, lap: 11 },
  { hue: 55, x: 80, y: 24, size: 54, dx: 8, dy: 9, lap: 13 },
  { hue: -50, x: 66, y: 80, size: 68, dx: 10, dy: 6, lap: 15 },
  { hue: 25, x: 24, y: 84, size: 50, dx: 7, dy: 8, lap: 9 },
];

// the orbs show less on ink, where colour carries further, and a little less on the accent itself
const STRENGTH: Record<Tone, number> = { paper: 1, stage: 1, accent: 0.8, ink: 0.45 };

function Backdrop({ tone, quiet }: { tone: Tone; quiet?: boolean }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { brand } = useShowcase();
  const { ground } = useSurface(tone);
  const { paper, accent } = brand.colors;
  const t = frame / fps;
  const strength = STRENGTH[tone] * (quiet ? 0.6 : 1);
  return (
    <AbsoluteFill style={{ background: ground, overflow: "hidden" }}>
      {ORBS.map((o, i) => {
        const a = (2 * Math.PI * t) / o.lap;
        const size = (o.size / 100) * Math.max(width, height) * (1 + 0.1 * Math.sin(1.7 * a + i));
        // on the accent ground, alternate orbs are paper so they still show against it
        const color = tone === "accent" && i % 2 ? paper : `oklch(from ${accent} l calc(c + 0.05) calc(h + ${o.hue}))`;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${o.x + o.dx * Math.sin(a)}%`,
              top: `${o.y + o.dy * Math.cos(0.8 * a)}%`,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
              opacity: 0.9 * strength,
              filter: "blur(30px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

// frosted glass, tinted with the ground it floats over
const glass = (s: Surface): CSSProperties => ({
  background: `color-mix(in oklab, ${s.ground} 46%, transparent)`,
  backdropFilter: "blur(18px) saturate(1.5)",
  border: `1px solid color-mix(in oklab, ${s.text} 10%, transparent)`,
  boxShadow: "0 12px 30px -16px rgba(0,0,0,0.3)",
});

const GlassChip = (props: ChipProps) => <Chip {...props} skin={glass(useSurface("paper"))} />;
const GlassCaption = (props: CaptionProps) => <Caption {...props} skin={glass(useSurface("stage"))} />;

export const aura: Style = { Backdrop, enter: { screen: "fade" }, Chip: GlassChip, Caption: GlassCaption };
