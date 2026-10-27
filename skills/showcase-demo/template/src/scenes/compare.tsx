import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { borderOf, shadowOf } from "../frames";
import { useShowcase, useSurface, Words } from "../parts";
import type { Scene } from "../types";

/** Before and after: two pictures of the same screen (files in public/ of the same size, such as screenshots
 *  or frames pulled from takes). The after wipes across the before behind a handle, pauses halfway so both
 *  show side by side, then takes the whole card. */
export function Compare({ scene }: { scene: Extract<Scene, { type: "compare" }> }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const { brand, style: S, spec } = useShowcase();
  const { paper, ink } = brand.colors;
  const s = useSurface("stage");
  const [before, after] = scene.labels ?? ["Before", "After"];
  const u = spec.type;
  const head = scene.title ? Math.round((spec.reframe ? 250 : 190) * u) : 0;
  const p = interpolate(frame, [0.9, 1.6, 2.2, 2.9].map((x) => x * fps), [0, 0.5, 0.5, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const label = (text: string, side: "left" | "right", opacity: number) => (
    <div style={{ position: "absolute", top: 18, [side]: 18, padding: "8px 18px", borderRadius: 999, background: ink, color: paper, fontSize: Math.round(24 * Math.max(u, 0.9)), fontWeight: 600, lineHeight: 1.2, opacity }}>{text}</div>
  );
  return (
    <AbsoluteFill>
      <S.Backdrop tone="stage" />
      {scene.title && (
        <div style={{ position: "absolute", left: 0, top: spec.top, width: W, height: head, display: "flex", alignItems: "center", justifyContent: "center", padding: `0 ${spec.padX}px` }}>
          <Words text={scene.title} size={(spec.reframe ? 84 : 62) * u} delay={Math.round(0.3 * fps)} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 600 }} />
        </div>
      )}
      <AbsoluteFill style={{ top: spec.top + head, height: H - spec.top - spec.bottom - head, alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", lineHeight: 0, borderRadius: 20, overflow: "hidden", background: "#fff", border: borderOf(brand, s), boxShadow: shadowOf(brand, s) }}>
          <Img src={staticFile(scene.before)} style={{ display: "block", maxWidth: W - 2 * (spec.reframe ? Math.round(W * 0.056) : 160), maxHeight: H - spec.top - spec.bottom - head - 48 }} />
          <Img src={staticFile(scene.after)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: `inset(0 ${(100 - 100 * p).toFixed(3)}% 0 0)` }} />
          {p > 0 && p < 1 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${100 * p}%`, width: 0 }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: -1.5, width: 3, background: ink }} />
              <div style={{ position: "absolute", top: "50%", left: -26, width: 52, height: 52, marginTop: -26, borderRadius: "50%", background: ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="28" height="16" viewBox="0 0 28 16">
                  <path d="M10 2L3 8l7 6M18 2l7 6-7 6" fill="none" stroke={paper} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}
          {label(after, "left", p)}
          {label(before, "right", 1 - p)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
