import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp } from "../motion";
import { useShowcase, useSpring, Words } from "../parts";

/** The logo turns in, then the name and the tagline arrive under it. */
export function Intro() {
  const { brand, style: S, spec } = useShowcase();
  const { ink, muted } = brand.colors;
  const u = spec.type;
  const logo = useSpring(0, { damping: 12, stiffness: 90 });
  return (
    <AbsoluteFill>
      <S.Backdrop tone="accent" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34 * u, padding: `0 ${spec.padX}px` }}>
        {brand.logo && (
          <Img src={staticFile(brand.logo)} style={{ width: 168 * u, height: 168 * u, opacity: clamp(logo * 2), transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -90}deg)` }} />
        )}
        <Words text={brand.name} size={156 * u} delay={10} color={ink} style={{ fontWeight: 600, letterSpacing: "-0.05em" }} />
        {brand.tagline && <Words text={brand.tagline} size={44 * u} delay={24} color={muted} style={{ letterSpacing: "-0.02em", maxWidth: 1300 }} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
