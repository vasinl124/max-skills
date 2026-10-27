import { AbsoluteFill, useVideoConfig } from "remotion";
import { useShowcase, useSurface, Words } from "../parts";
import type { Scene } from "../types";

/** A title card: kinetic words, with a marker stroke under the *starred* ones, on paper, ink or the accent. */
export function Title({ scene }: { scene: Extract<Scene, { type: "title" }> }) {
  const { fps } = useVideoConfig();
  const { style: S, spec } = useShowcase();
  const theme = scene.theme ?? "light";
  const tone = theme === "dark" ? "ink" : theme === "accent" ? "accent" : "paper";
  const s = useSurface(tone);
  const u = spec.type;
  // the words wait out the transition in, so they never cross-fade with the last scene's
  return (
    <AbsoluteFill>
      <S.Backdrop tone={tone} quiet />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 * u, padding: `0 ${spec.padX}px` }}>
        {scene.kicker && <S.Kicker text={scene.kicker} color={s.muted} delay={Math.round(0.35 * fps)} size={22 * Math.max(u, 0.9)} />}
        <Words text={scene.text} size={120 * u} delay={Math.round(0.45 * fps)} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 600 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
