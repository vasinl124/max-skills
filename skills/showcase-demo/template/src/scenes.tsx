import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { serif } from "./fonts";
import { camera, clamp, pointer, project, type Layout, type Pt, type Take, type TakeEvent } from "./motion";

export type Brand = {
  name: string;
  tagline?: string;
  url?: string; // shown in the window's address bar and, by default, as the outro's call to action
  logo?: string; // a file in public/
  // stage: behind the window in screen scenes (default: accent); paper or ink when the app is itself the accent
  colors: { paper: string; ink: string; accent: string; muted: string; stage?: string };
  style?: "soft" | "hard"; // the window's shadow: soft and deep, or a hard offset in ink
};
export type Scene =
  | { type: "intro"; seconds?: number }
  | { type: "title"; text: string; kicker?: string; theme?: "light" | "dark" | "accent"; seconds?: number }
  | { type: "screen"; take: string; title?: string; kicker?: string; from?: number; to?: number }
  | { type: "outro"; text?: string; cta?: string; seconds?: number };

const BAR = 44; // the window's title bar

const useSpring = (delay = 0, config: { damping?: number; stiffness?: number } = { damping: 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** Text that arrives a word at a time, rising out of a blur. *Starred* words are the accent: set in the
 *  serif's italic, over a marker stroke that draws in once the line has landed (or in `accentColor`). */
function Words(props: { text: string; size: number; color: string; delay?: number; mark?: string; accentColor?: string; style?: CSSProperties }) {
  const { text, size, color, delay = 0, mark, accentColor, style } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split("*").flatMap((part, i) => part.split(/\s+/).filter(Boolean).map((word) => ({ word, accent: i % 2 === 1 })));
  const swipe = spring({ frame: frame - delay - words.length * 3 - 8, fps, config: { damping: 200 } });
  return (
    <div style={{ fontSize: size, lineHeight: 1.08, letterSpacing: "-0.045em", color, textAlign: "center", textWrap: "balance", ...style }}>
      {words.map(({ word, accent }, i) => {
        const p = spring({ frame: frame - delay - i * 3, fps, config: { damping: 200 } });
        return (
          <span key={i}>
            {i > 0 && " "}
            <span
              style={{
                display: "inline-block",
                position: "relative",
                opacity: p,
                transform: `translateY(${(1 - p) * 0.45}em)`,
                filter: `blur(${(1 - p) * 10}px)`,
                ...(accent && { fontFamily: serif, fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em", color: accentColor ?? color }),
              }}
            >
              {accent && mark && (
                <span
                  style={{
                    position: "absolute",
                    inset: "0.2em -0.1em 0.04em",
                    background: mark,
                    borderRadius: "0.1em",
                    zIndex: -1,
                    transformOrigin: "left",
                    transform: `scaleX(${swipe})`,
                  }}
                />
              )}
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Kicker({ text, color, delay = 0 }: { text: string; color: string; delay?: number }) {
  const p = useSpring(delay);
  return (
    <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      {text}
    </div>
  );
}

/** A flat brand colour with a soft light drifting across it, so no frame ever looks frozen. */
function Backdrop({ color, light }: { color: string; light: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = frame / fps / 5;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(55% 65% at ${50 + 20 * Math.sin(a)}% ${40 + 14 * Math.cos(a * 1.3)}%, color-mix(in oklab, ${light} 75%, transparent), transparent 75%), ${color}`,
      }}
    />
  );
}

function Browser({ brand, width, children }: { brand: Brand; width: number; children: ReactNode }) {
  const { ink, muted } = brand.colors;
  const hard = brand.style === "hard";
  return (
    <div
      style={{
        width,
        borderRadius: 16,
        overflow: "hidden",
        background: "#fff",
        border: `1px solid ${hard ? ink : "rgba(0,0,0,0.1)"}`,
        boxShadow: hard ? `12px 12px 0 ${ink}` : "0 60px 120px -40px rgba(0,0,0,0.45), 0 24px 48px -24px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "#f5f5f3", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        {brand.url && (
          <div style={{ margin: "0 auto", transform: "translateX(-32px)", display: "flex", alignItems: "center", gap: 9, padding: "6px 24px", borderRadius: 8, background: "rgba(0,0,0,0.05)", color: muted, fontSize: 16 }}>
            <svg width="11" height="14" viewBox="0 0 11 14">
              <rect x="0.5" y="6" width="10" height="7.5" rx="1.6" fill={muted} />
              <path d="M2.8 6V4.2a2.7 2.7 0 0 1 5.4 0V6" stroke={muted} strokeWidth="1.6" fill="none" />
            </svg>
            {brand.url}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Intro({ brand }: { brand: Brand }) {
  const { paper, ink, accent, muted } = brand.colors;
  const logo = useSpring(0, { damping: 12, stiffness: 90 });
  return (
    <AbsoluteFill>
      <Backdrop color={accent} light={paper} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34 }}>
        {brand.logo && (
          <Img src={staticFile(brand.logo)} style={{ width: 168, height: 168, opacity: clamp(logo * 2), transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -90}deg)` }} />
        )}
        <Words text={brand.name} size={156} delay={10} color={ink} style={{ fontWeight: 600, letterSpacing: "-0.05em" }} />
        {brand.tagline && <Words text={brand.tagline} size={44} delay={24} color={muted} style={{ letterSpacing: "-0.02em", maxWidth: 1300 }} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function Title({ scene, brand }: { scene: Extract<Scene, { type: "title" }>; brand: Brand }) {
  const { fps } = useVideoConfig();
  const { paper, ink, accent, muted } = brand.colors;
  const theme = scene.theme ?? "light";
  const [bg, fg] = theme === "dark" ? [ink, paper] : theme === "accent" ? [accent, ink] : [paper, ink];
  // the words wait out the transition in, so they never cross-fade with the last scene's
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, padding: "0 200px" }}>
        {scene.kicker && <Kicker text={scene.kicker} color={theme === "dark" ? accent : muted} delay={Math.round(0.35 * fps)} />}
        <Words
          text={scene.text}
          size={120}
          delay={Math.round(0.45 * fps)}
          color={fg}
          mark={theme === "light" ? accent : theme === "accent" ? paper : undefined}
          accentColor={theme === "dark" ? accent : undefined}
          style={{ fontWeight: 600 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** A take in a browser window on the brand's colour. The camera pushes in on each zoom, a drawn cursor
 *  travels and clicks, callouts ring what matters, and a badge owns up to every sped-up stretch. */
export function Screen({ scene, take, brand }: { scene: Extract<Scene, { type: "screen" }>; take: Take; brand: Brand }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const { paper, ink, accent, muted, stage = accent } = brand.colors;
  const t = (scene.from ?? 0) + frame / fps; // the take's clock
  const { width: vw, height: vh } = take.viewport;
  const band = scene.title ? 190 : 0; // room for the headline above the window
  const k = Math.min((W - 240) / vw, (H - band - 96 - BAR) / vh);
  const L: Layout = { W, H, k, ox: (W - vw * k) / 2, oy: band + (H - band - vh * k - BAR) / 2 + BAR };
  const cam = camera(take.events, t, L);
  const at = (p: Pt) => project(p, L, cam);
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 36 });
  const cursor = pointer(take.events, t);
  const callouts = take.events.filter((e) => e.type === "callout" && t >= e.t && t < e.until + 0.3) as Extract<TakeEvent, { type: "callout" }>[];
  const speed = take.events.find((e) => e.type === "speed" && t >= e.t && t < e.until) as Extract<TakeEvent, { type: "speed" }> | undefined;
  return (
    <AbsoluteFill>
      <Backdrop color={stage} light={stage === paper ? accent : paper} />
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${W / 2 - cam.x * cam.s}px, ${H / 2 - cam.y * cam.s}px) scale(${cam.s})` }}>
        <div style={{ position: "absolute", left: L.ox, top: L.oy - BAR, perspective: 1800 }}>
          <div style={{ transformOrigin: "50% 0", transform: `translateY(${(1 - enter) * 140}px) rotateX(${(1 - enter) * 16}deg) scale(${0.94 + 0.06 * enter})`, opacity: clamp(enter * 1.6) }}>
            <Browser brand={brand} width={vw * k}>
              <Video
                src={staticFile(`takes/${scene.take}.mp4`)}
                trimBefore={Math.round((scene.from ?? 0) * fps)}
                muted
                style={{ display: "block", width: vw * k, height: vh * k }}
              />
            </Browser>
          </div>
        </div>
      </AbsoluteFill>
      {scene.title && (
        <AbsoluteFill style={{ height: band, alignItems: "center", justifyContent: "center", gap: 14, opacity: interpolate(cam.s, [1, 1.1], [1, 0], { extrapolateRight: "clamp" }) }}>
          {scene.kicker && <Kicker text={scene.kicker} color={muted} delay={Math.round(0.35 * fps)} />}
          <Words text={scene.title} size={62} delay={Math.round(0.45 * fps)} color={ink} mark={stage === accent ? paper : accent} style={{ fontWeight: 600 }} />
        </AbsoluteFill>
      )}
      {callouts.map((e) => (
        <Callout key={e.t} e={e} t={t} at={at} brand={brand} />
      ))}
      {cursor && <Cursor cursor={cursor} at={at} size={30 * k * cam.s} ink={ink} />}
      {speed && (
        <div
          style={{
            position: "absolute",
            right: 56,
            top: 48,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 22px",
            borderRadius: 999,
            background: ink,
            color: paper,
            fontSize: 26,
            fontWeight: 600,
            opacity: clamp((t - speed.t) / 0.25) * (1 - clamp((t - speed.until + 0.25) / 0.25)),
          }}
        >
          <svg width="26" height="16" viewBox="0 0 26 16">
            <path d="M1 1l11 7-11 7zM13 1l11 7-11 7z" fill={paper} />
          </svg>
          {speed.rate}×
        </div>
      )}
    </AbsoluteFill>
  );
}

function Cursor({ cursor, at, size, ink }: { cursor: NonNullable<ReturnType<typeof pointer>>; at: (p: Pt) => Pt; size: number; ink: string }) {
  const [x, y] = at(cursor.at);
  const ripple = cursor.ripple && { c: at(cursor.ripple.at), r: (0.3 + 1.2 * cursor.ripple.p) * size, o: 0.55 * (1 - cursor.ripple.p) };
  return (
    <>
      {ripple && (
        <div style={{ position: "absolute", left: ripple.c[0] - ripple.r, top: ripple.c[1] - ripple.r, width: 2 * ripple.r, height: 2 * ripple.r, borderRadius: "50%", border: `${size / 9}px solid ${ink}`, opacity: ripple.o }} />
      )}
      {/* the arrow's tip is at (3.8, 1.9) of 24 */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{
          position: "absolute",
          left: x - size * 0.158,
          top: y - size * 0.079,
          overflow: "visible",
          opacity: cursor.opacity,
          transformOrigin: "16% 8%",
          transform: `scale(${1 - 0.2 * cursor.press})`,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
        }}
      >
        <path d="M3.8 1.9 L3.8 19.5 L8.4 15.2 L11.6 22.4 L14.6 21.1 L11.5 14 L17.9 14 Z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </>
  );
}

function Callout({ e, t, at, brand }: { e: Extract<TakeEvent, { type: "callout" }>; t: number; at: (p: Pt) => Pt; brand: Brand }) {
  const { fps, width: W } = useVideoConfig();
  const { paper, ink } = brand.colors;
  const pop = spring({ frame: Math.max(0, (t - e.t) * fps), fps, config: { damping: 16, stiffness: 170 } });
  const out = clamp((t - e.until) / 0.3);
  const [x0, y0] = at([e.box.x, e.box.y]);
  const [x1, y1] = at([e.box.x + e.box.w, e.box.y + e.box.h]);
  const pad = 10;
  const w = x1 - x0 + 2 * pad;
  const h = y1 - y0 + 2 * pad;
  const above = y0 > 150;
  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", left: x0 - pad, top: y0 - pad, overflow: "visible", opacity: 1 - out }}>
        <rect width={w} height={h} rx={14} fill="none" stroke={ink} strokeWidth={4} strokeDasharray={2 * (w + h)} strokeDashoffset={2 * (w + h) * (1 - clamp(pop))} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: clamp((x0 + x1) / 2, 260, W - 260),
          top: above ? y0 - pad - 16 : y1 + pad + 16,
          transform: `translate(-50%, ${above ? "-100%" : "0"}) scale(${0.85 + 0.15 * pop})`,
          opacity: clamp(pop) * (1 - out),
          padding: "14px 26px",
          borderRadius: 999,
          background: ink,
          color: paper,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          boxShadow: "0 14px 30px -12px rgba(0,0,0,0.45)",
        }}
      >
        {e.text}
      </div>
    </>
  );
}

export function Outro({ scene, brand }: { scene: Extract<Scene, { type: "outro" }>; brand: Brand }) {
  const { fps } = useVideoConfig();
  const { paper, ink, accent } = brand.colors;
  const lockup = useSpring(Math.round(0.3 * fps));
  const pop = useSpring(Math.round(1.3 * fps), { damping: 14, stiffness: 160 });
  const cta = scene.cta ?? brand.url;
  return (
    <AbsoluteFill>
      <Backdrop color={accent} light={paper} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: lockup, transform: `translateY(${(1 - lockup) * 24}px)` }}>
          {brand.logo && <Img src={staticFile(brand.logo)} style={{ width: 72, height: 72 }} />}
          <span style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-0.045em", color: ink }}>{brand.name}</span>
        </div>
        {scene.text && <Words text={scene.text} size={112} delay={Math.round(0.5 * fps)} color={ink} mark={paper} style={{ fontWeight: 600 }} />}
        {cta && (
          <div style={{ opacity: clamp(pop), transform: `scale(${0.8 + 0.2 * pop})`, padding: "18px 40px", borderRadius: 999, background: ink, color: paper, fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {cta} →
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
