import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { useShowcase } from "../parts";
import type { Brand } from "../types";
import type { Style, Surface, Tone } from ".";

// rays: the brand after dark. Every scene sits on a deep version of its ink, lit from just above the frame
// by slow, swaying beams of its accent, with the odd sparkle drifting in the light. Text is paper, starred
// words glow in the accent, and windows glow instead of casting a shadow.

const surface = (_tone: Tone, c: Brand["colors"]): Surface => ({
  ground: `color-mix(in oklab, ${c.ink} 80%, black)`,
  text: c.paper,
  muted: `color-mix(in oklab, ${c.paper} 62%, ${c.ink})`,
  em: c.accent,
  glow: `color-mix(in oklab, ${c.accent} 50%, transparent)`,
  edge: c.accent,
});

// how brightly each tone is lit: the intro and outro most, the screens' stage least, so takes stay readable
const LIGHT: Record<Tone, number> = { accent: 1, ink: 0.8, paper: 0.65, stage: 0.45 };

// nine beams fanned across the frame from a source above its centre, each breathing at its own pace (angles
// in degrees clockwise from straight up, so 180 points straight down)
const BEAMS = Array.from({ length: 9 }, (_, i) => ({
  at: 148 + i * 8 + (random(`ray-at-${i}`) - 0.5) * 2,
  width: 1.2 + random(`ray-width-${i}`) * 1.8,
  speed: 0.3 + random(`ray-speed-${i}`) * 0.5,
  phase: random(`ray-phase-${i}`) * 2 * Math.PI,
  power: 0.35 + random(`ray-power-${i}`) * 0.65,
}));

const SPARKS = Array.from({ length: 7 }, (_, i) => ({
  x: 18 + random(`spark-x-${i}`) * 64,
  y: 6 + random(`spark-y-${i}`) * 48,
  size: 12 + random(`spark-size-${i}`) * 18,
  speed: 0.6 + random(`spark-speed-${i}`) * 0.8,
  phase: random(`spark-phase-${i}`) * 2 * Math.PI,
}));

function Backdrop({ tone, quiet }: { tone: Tone; quiet?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand } = useShowcase();
  const { paper, accent } = brand.colors;
  const t = frame / fps;
  const light = LIGHT[tone] * (quiet ? 0.7 : 1);
  const sway = 4 * Math.sin(t / 2.6);
  const beams = BEAMS.map((b) => {
    const a = b.at + sway;
    const o = Math.round(100 * light * b.power * (0.55 + 0.45 * Math.sin(t * b.speed + b.phase)));
    return `transparent ${(a - b.width).toFixed(2)}deg, color-mix(in oklab, ${accent} ${o}%, transparent) ${a.toFixed(2)}deg, transparent ${(a + b.width).toFixed(2)}deg`;
  });
  return (
    <AbsoluteFill style={{ background: surface(tone, brand.colors).ground, overflow: "hidden" }}>
      {/* the source: a warm glow just above the frame */}
      <AbsoluteFill style={{ background: `radial-gradient(60% 45% at 50% -8%, color-mix(in oklab, ${accent} ${Math.round(55 * light)}%, transparent), transparent 70%)` }} />
      {/* the beams, softened and fading with distance from the source */}
      <AbsoluteFill
        style={{
          background: `conic-gradient(from 0deg at 50% -18%, transparent 0deg, ${beams.join(", ")}, transparent 360deg)`,
          filter: "blur(14px)",
          maskImage: "radial-gradient(130% 105% at 50% -18%, black 20%, transparent 80%)",
        }}
      />
      {SPARKS.map((p, i) => {
        const twinkle = Math.max(0, Math.sin(t * p.speed + p.phase)) ** 3 * light;
        return (
          <svg
            key={i}
            viewBox="-1 -1 2 2"
            width={p.size}
            height={p.size}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y + 2 * Math.sin(t / 3 + i)}%`,
              opacity: twinkle,
              transform: `translate(-50%, -50%) scale(${0.4 + 0.6 * twinkle}) rotate(${t * 25 + i * 40}deg)`,
              filter: `drop-shadow(0 0 6px ${accent})`,
            }}
          >
            <path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z" fill={paper} />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
}

export const rays: Style = { Backdrop, surface, enter: { screen: "slide" } };
