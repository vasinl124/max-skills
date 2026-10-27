import { AbsoluteFill, useVideoConfig } from "remotion";
import { Kicker, useShowcase, Words } from "../parts";
import type { Scene } from "../types";

/** A title card: kinetic words, with a marker stroke under the *starred* ones, on paper, ink or the accent. */
export function Title({ scene }: { scene: Extract<Scene, { type: "title" }> }) {
  const { fps } = useVideoConfig();
  const { brand, style: S, spec } = useShowcase();
  const { paper, ink, accent, muted } = brand.colors;
  const theme = scene.theme ?? "light";
  const u = spec.type;
  // the words wait out the transition in, so they never cross-fade with the last scene's
  return (
    <AbsoluteFill>
      <S.Backdrop tone={theme === "dark" ? "ink" : theme === "accent" ? "accent" : "paper"} quiet />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 * u, padding: `0 ${spec.padX}px` }}>
        {scene.kicker && <Kicker text={scene.kicker} color={theme === "dark" ? accent : muted} delay={Math.round(0.35 * fps)} size={22 * Math.max(u, 0.9)} />}
        <Words
          text={scene.text}
          size={120 * u}
          delay={Math.round(0.45 * fps)}
          color={theme === "dark" ? paper : ink}
          mark={theme === "light" ? accent : theme === "accent" ? paper : undefined}
          accentColor={theme === "dark" ? accent : undefined}
          style={{ fontWeight: 600 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
