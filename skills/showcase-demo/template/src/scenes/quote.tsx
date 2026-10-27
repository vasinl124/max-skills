import { AbsoluteFill, useVideoConfig } from "remotion";
import { serif } from "../fonts";
import { useShowcase, useSpring, useSurface, Words } from "../parts";
import type { Scene } from "../types";

/** A pull quote: a line someone said, set large under an opening quote mark, with who said it. */
export function Quote({ scene }: { scene: Extract<Scene, { type: "quote" }> }) {
  const { fps } = useVideoConfig();
  const { style: S, spec } = useShowcase();
  const theme = scene.theme ?? "light";
  const tone = theme === "dark" ? "ink" : theme === "accent" ? "accent" : "paper";
  const s = useSurface(tone);
  const u = spec.type;
  const mark = useSpring(Math.round(0.2 * fps), { damping: 14, stiffness: 120 });
  const by = useSpring(Math.round(1.4 * fps));
  return (
    <AbsoluteFill>
      <S.Backdrop tone={tone} quiet />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 * u, padding: `0 ${spec.padX}px` }}>
        <div style={{ fontFamily: serif, fontSize: 260 * u, lineHeight: 1, height: 130 * u, color: s.em, textShadow: s.glow && `0 0 0.2em ${s.glow}`, opacity: mark, transform: `scale(${0.6 + 0.4 * mark})` }}>“</div>
        <Words text={scene.text} size={(spec.reframe ? 80 : 76) * u} delay={Math.round(0.35 * fps)} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 500, maxWidth: 1500 }} />
        {scene.by && <div style={{ fontSize: 32 * u, fontWeight: 500, letterSpacing: "-0.01em", color: s.muted, opacity: by, transform: `translateY(${(1 - by) * 12}px)` }}>— {scene.by}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
