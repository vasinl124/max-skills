import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { serif } from "../fonts";
import { clamp } from "../motion";
import { useShowcase, useSurface } from "../parts";
import type { Scene } from "../types";

// The numbers' type size that fits: up to 230 px, shrinking with more or longer values. A number's cell is
// at least 1.09 em wide (0.66 em a character), a label about 0.53 of its size a character. In a row the
// items and their 0.74 em gaps fit `across`; stacked (portrait), each fits across and all fit `down`.
const statSize = (items: { value: string; label: string }[], labelSize: number, across: number, down?: number) => {
  const wide = (it: { value: string; label: string }, s: number) => Math.max(Math.max(1.09, it.value.length * 0.66) * s, it.label.length * 0.53 * labelSize);
  const fits = (s: number) =>
    down
      ? items.every((it) => wide(it, s) <= across) && items.length * (1.09 * s + 1.6 * labelSize) + (items.length - 1) * 0.3 * s <= down
      : items.reduce((sum, it) => sum + wide(it, s), 0) + (items.length - 1) * 0.74 * s <= across;
  let size = 230;
  while (size > 80 && !fits(size)) size -= 10;
  return size;
};

/** A beat of facts: each number rolls into place like a counter, and the last lands on an accent disc,
 *  the punchline. Two to four items, in a row, or stacked in a portrait frame; the type shrinks to fit. */
export function Stats({ scene }: { scene: Extract<Scene, { type: "stats" }> }) {
  const { fps, width, height } = useVideoConfig();
  const { style: S, spec } = useShowcase();
  const labelSize = Math.round(40 * spec.type);
  const stacked = height > width;
  const size = statSize(scene.items, labelSize, width - 2 * Math.min(120, spec.padX), stacked ? 0.6 * height : undefined);
  return (
    <AbsoluteFill>
      <S.Backdrop tone="paper" />
      <AbsoluteFill style={{ flexDirection: stacked ? "column" : "row", alignItems: "center", justifyContent: "center", gap: (stacked ? 0.3 : 0.74) * size }}>
        {scene.items.map((item, i) => (
          <Stat key={i} {...item} size={size} labelSize={labelSize} delay={Math.round(0.4 * fps) + i * Math.round(0.45 * fps)} last={i === scene.items.length - 1} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Stat({ value, label, size, labelSize, delay, last }: { value: string; label: string; size: number; labelSize: number; delay: number; last: boolean }) {
  const frame = useCurrentFrame() - delay;
  const { fps } = useVideoConfig();
  const { brand } = useShowcase();
  const { ink, accent } = brand.colors;
  const s = useSurface("paper");
  const CELL = Math.round(size * 1.09);
  const roll = spring({ frame, fps, config: { damping: 20, stiffness: 60 } });
  const settle = spring({ frame: frame - 0.25 * fps, fps, config: { damping: 200 } });
  const disc = spring({ frame: frame - 0.9 * fps, fps, config: { damping: 12, stiffness: 140 } });
  const digitStyle = { lineHeight: `${CELL}px`, fontFamily: serif, fontStyle: "normal", fontSize: size, color: last ? `color-mix(in oklab, ${ink} ${Math.round(clamp(disc) * 100)}%, ${s.text})` : s.text } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * (labelSize / 40), opacity: clamp(frame / 6) }}>
      <div style={{ position: "relative", minWidth: CELL, height: CELL, display: "flex", justifyContent: "center" }}>
        {last && <div style={{ position: "absolute", left: "50%", top: 0, width: CELL, height: CELL, marginLeft: -CELL / 2, borderRadius: "50%", background: accent, boxShadow: s.glow && `0 0 ${CELL / 3}px ${s.glow}`, transform: `scale(${disc})` }} />}
        {/* each digit is a strip of 0–9, twice over, rolling up to its value in the second run */}
        {[...value].map((ch, d) =>
          /[0-9]/.test(ch) ? (
            <div key={d} style={{ position: "relative", height: CELL, overflow: "hidden" }}>
              <div style={{ transform: `translateY(${-roll * (10 + Number(ch)) * CELL}px)`, filter: `blur(${(1 - settle) * 6}px)` }}>
                {Array.from({ length: 20 }, (_, n) => (
                  <div key={n} style={{ ...digitStyle, height: CELL, textAlign: "center" }}>
                    {n % 10}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div key={d} style={{ ...digitStyle, position: "relative" }}>
              {ch}
            </div>
          ),
        )}
      </div>
      <div style={{ fontSize: labelSize, fontWeight: 600, letterSpacing: "-0.025em", color: s.muted, opacity: settle, transform: `translateY(${(1 - settle) * 16}px)` }}>{label}</div>
    </div>
  );
}
