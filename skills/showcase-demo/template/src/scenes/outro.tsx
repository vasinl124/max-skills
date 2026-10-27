import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { clamp } from "../motion";
import { useShowcase, useSpring, useSurface, Words } from "../parts";
import type { Scene } from "../types";

/** The lockup, the closing line and the call to action. */
export function Outro({ scene }: { scene: Extract<Scene, { type: "outro" }> }) {
  const { fps } = useVideoConfig();
  const { brand, style: S, spec } = useShowcase();
  const { paper, ink } = brand.colors;
  const s = useSurface("accent");
  const u = spec.type;
  const lockup = useSpring(Math.round(0.3 * fps));
  const pop = useSpring(Math.round(1.3 * fps), { damping: 14, stiffness: 160 });
  const cta = scene.cta ?? brand.url;
  return (
    <AbsoluteFill>
      <S.Backdrop tone="accent" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 48 * u, padding: `0 ${spec.padX}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 * u, opacity: lockup, transform: `translateY(${(1 - lockup) * 24}px)` }}>
          {brand.logo && <Img src={staticFile(brand.logo)} style={{ width: 72 * u, height: 72 * u, filter: s.text === ink ? undefined : "brightness(0) invert(1)" }} />}
          <span style={{ fontSize: 60 * u, fontWeight: 600, letterSpacing: "-0.045em", color: s.text }}>{brand.name}</span>
        </div>
        {scene.text && <Words text={scene.text} size={112 * u} delay={Math.round(0.5 * fps)} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 600 }} />}
        {cta && (
          <div style={{ opacity: clamp(pop), transform: `scale(${0.8 + 0.2 * pop})`, padding: `${18 * u}px ${40 * u}px`, borderRadius: 999, background: s.text, color: s.text === ink ? paper : ink, fontSize: 36 * u, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {cta} →
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
