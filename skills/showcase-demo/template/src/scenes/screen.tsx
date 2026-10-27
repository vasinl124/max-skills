import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import type { FormatSpec } from "../formats";
import { borderOf, FRAMES, shadowOf } from "../frames";
import { camera, clamp, focusOf, pointer, project, viewOf, type Layout, type Pt, type Rect, type Take, type TakeEvent } from "../motion";
import { Kicker, useShowcase, Words } from "../parts";
import type { Brand, Scene } from "../types";

type Say = Extract<TakeEvent, { type: "say" }>;
type Callout = Extract<TakeEvent, { type: "callout" }>;
type Speed = Extract<TakeEvent, { type: "speed" }>;

const HANDOFF = 0.2; // seconds a caption takes to leave before the next one comes in

// Where a screen's parts go. In 16:9 the whole take plays in a window between the headline band and the
// caption band. In reframed formats a card fills the space between them, cut to the take's action
// (focusOf) at the largest scale that fits, and the camera rests on that action and follows it.
function arrange(spec: FormatSpec, W: number, H: number, take: Take, o: { title: boolean; captions: boolean; chip: boolean; bar: number }) {
  const { width: vw, height: vh } = take.viewport;
  if (!spec.reframe) {
    const head = o.title ? 190 : o.chip ? 72 : 0;
    const cap = o.captions ? 150 : 0;
    const k = Math.min((W - 240) / vw, (H - head - cap - 96 - o.bar) / vh);
    const win = { x: (W - vw * k) / 2, y: head + (H - head - cap - vh * k - o.bar) / 2, w: vw * k };
    const L: Layout = { W, H, k, ox: win.x, oy: win.y + o.bar };
    return { L, win, head: o.title ? { y: 0, h: head } : null, cap: cap ? { y: H - cap, h: cap } : null };
  }
  const head = o.title ? Math.round(250 * spec.type) : 0;
  const cap = o.captions ? Math.round(200 * spec.type) : 0;
  const top = spec.top + head + (head ? 16 : 0);
  const band = { w: W - 2 * Math.round(W * 0.056), h: H - spec.bottom - cap - (cap ? 16 : 0) - top };
  const f = focusOf(take);
  const k = Math.min(band.w / f.w, band.h / f.h);
  // the card is as much of the band as the take covers at that scale
  const [w, h] = [Math.min(band.w, vw * k), Math.min(band.h, vh * k)];
  const view: Rect = { x: (W - w) / 2, y: top + (band.h - h) / 2, w, h };
  const [ox, oy] = [view.x + (w - vw * k) / 2, view.y + (h - vh * k) / 2];
  const L: Layout = { W, H, k, ox, oy, view, bounds: { x: ox, y: oy, w: vw * k, h: vh * k }, follow: true, rest: [f.x + f.w / 2, f.y + f.h / 2] };
  return { L, win: null, head: o.title ? { y: spec.top, h: head } : null, cap: cap ? { y: H - spec.bottom - cap, h: cap } : null };
}

/** A take on the brand's stage. The camera pushes in on each zoom, a drawn cursor travels and clicks,
 *  callouts ring what matters, captions narrate under it, and a badge owns up to every sped-up stretch. */
export function Screen({ scene, take, chapter }: { scene: Extract<Scene, { type: "screen" }>; take: Take; chapter?: string }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const { board, brand, style: S, spec } = useShowcase();
  const { paper, ink, accent, muted, stage = accent } = brand.colors;
  const t = (scene.from ?? 0) + frame / fps; // the take's clock
  const says = take.events.filter((e) => e.type === "say") as Say[];
  const chip = board.chip !== false && !!chapter;
  const chrome = FRAMES[scene.frame ?? "browser"];
  if (!chrome) throw new Error(`No frame "${scene.frame}" in frames.tsx; there are: ${Object.keys(FRAMES).join(", ")}`);
  const { L, win, head, cap } = arrange(spec, W, H, take, {
    title: !!scene.title,
    captions: says.length > 0,
    chip,
    bar: chrome.bar,
  });
  const v = viewOf(L);
  const cam = camera(take.events, t, L);
  // the camera layer and the overlays work in the view's own coordinates
  const at = (p: Pt): Pt => {
    const [x, y] = project(p, L, cam);
    return [x - v.x, y - v.y];
  };
  const lens = { position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${v.w / 2 - cam.x * cam.s}px, ${v.h / 2 - cam.y * cam.s}px) scale(${cam.s})` } as const;
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 36 });
  const { width: vw, height: vh } = take.viewport;
  const video = (
    <Video src={staticFile(`takes/${scene.take}.mp4`)} trimBefore={Math.round((scene.from ?? 0) * fps)} muted style={{ display: "block", width: vw * L.k, height: vh * L.k }} />
  );
  const overlays = <Overlays take={take} t={t} at={at} size={[v.w, v.h]} cursorSize={30 * L.k * cam.s} brand={brand} />;
  let said = -1;
  says.forEach((e, i) => {
    if (e.t <= t) said = i;
  });
  const fg = stage === ink ? paper : ink;
  // in 16:9 the window grows over the bands as the camera pushes in: the headline steps aside and the
  // captions take a backing
  const pushed = win ? interpolate(cam.s, [1, 1.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill>
      <S.Backdrop tone="stage" />
      {win ? (
        <>
          <AbsoluteFill>
            <div style={lens}>
              <div style={{ position: "absolute", left: win.x, top: win.y, perspective: 1800 }}>
                <div style={{ transformOrigin: "50% 0", transform: `translateY(${(1 - enter) * 140}px) rotateX(${(1 - enter) * 16}deg) scale(${0.94 + 0.06 * enter})`, opacity: clamp(enter * 1.6) }}>
                  <chrome.Chrome width={win.w}>{video}</chrome.Chrome>
                </div>
              </div>
            </div>
          </AbsoluteFill>
          {overlays}
        </>
      ) : (
        <div style={{ position: "absolute", left: v.x, top: v.y, width: v.w, height: v.h, transform: `translateY(${(1 - enter) * 80}px) scale(${0.96 + 0.04 * enter})`, opacity: clamp(enter * 1.6) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 28 * spec.type, overflow: "hidden", background: "#fff", border: borderOf(brand), boxShadow: shadowOf(brand) }}>
            <div style={lens}>
              <div style={{ position: "absolute", left: L.ox, top: L.oy }}>{video}</div>
            </div>
            {overlays}
          </div>
        </div>
      )}
      {/* a sped-up stretch: top right of the frame, or on a card's top edge, clear of the app's own corners */}
      <SpeedBadge take={take} t={t} brand={brand} place={win ? { right: 56, top: 48 } : { left: v.x + v.w / 2, top: v.y, transform: "translate(-50%, -50%)" }} />
      {head && scene.title && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: head.y,
            width: W,
            height: head.h,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: `0 ${spec.padX}px`,
            opacity: 1 - pushed,
          }}
        >
          {scene.kicker && !chip && <Kicker text={scene.kicker} color={muted} delay={Math.round(0.35 * fps)} />}
          <Words text={scene.title} size={(spec.reframe ? 84 : 62) * spec.type} delay={Math.round(0.45 * fps)} color={fg} mark={stage === accent ? paper : accent} style={{ fontWeight: 600 }} />
        </div>
      )}
      {cap && said >= 0 && (
        <div style={{ position: "absolute", left: 0, top: cap.y, width: W, height: cap.h }}>
          {said > 0 && t - says[said].t < HANDOFF && (
            <Band padX={spec.padX}>
              <S.Caption text={says[said - 1].text} age={9} leaving={(t - says[said].t) / HANDOFF} plate={pushed} />
            </Band>
          )}
          <Band padX={spec.padX}>
            <S.Caption text={says[said].text} age={t - says[said].t - (said > 0 ? HANDOFF : 0)} leaving={0} plate={pushed} />
          </Band>
        </div>
      )}
    </AbsoluteFill>
  );
}

const Band = ({ padX, children }: { padX: number; children: ReactNode }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: `0 ${padX}px` }}>{children}</div>
);

// The cursor and the callouts, over the take in the view's coordinates (size: the view's).
function Overlays(props: { take: Take; t: number; at: (p: Pt) => Pt; size: [number, number]; cursorSize: number; brand: Brand }) {
  const { take, t, at, size, cursorSize, brand } = props;
  const cursor = pointer(take.events, t);
  const callouts = take.events.filter((e) => e.type === "callout" && t >= e.t && t < e.until + 0.3) as Callout[];
  return (
    <AbsoluteFill>
      {callouts.map((e) => (
        <CalloutRing key={e.t} e={e} t={t} at={at} size={size} brand={brand} />
      ))}
      {cursor && <Cursor cursor={cursor} at={at} size={cursorSize} ink={brand.colors.ink} />}
    </AbsoluteFill>
  );
}

function SpeedBadge({ take, t, brand, place }: { take: Take; t: number; brand: Brand; place: CSSProperties }) {
  const { paper, ink } = brand.colors;
  const speed = take.events.find((e) => e.type === "speed" && t >= e.t && t < e.until) as Speed | undefined;
  if (!speed) return null;
  return (
    <div
      style={{
        position: "absolute",
        ...place,
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

function CalloutRing({ e, t, at, size: [cw, ch], brand }: { e: Callout; t: number; at: (p: Pt) => Pt; size: [number, number]; brand: Brand }) {
  const { fps } = useVideoConfig();
  const { paper, ink } = brand.colors;
  const pop = spring({ frame: Math.max(0, (t - e.t) * fps), fps, config: { damping: 16, stiffness: 170 } });
  const out = clamp((t - e.until) / 0.3);
  const [x0, y0] = at([e.box.x, e.box.y]);
  const [x1, y1] = at([e.box.x + e.box.w, e.box.y + e.box.h]);
  const pad = 10;
  const w = x1 - x0 + 2 * pad;
  const h = y1 - y0 + 2 * pad;
  // under the target when there's room: what sits above it (a question, a header) is usually its context
  const above = y1 + pad + 100 > ch && y0 > 150;
  const edge = Math.min(260, cw / 2);
  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", left: x0 - pad, top: y0 - pad, overflow: "visible", opacity: 1 - out }}>
        <rect width={w} height={h} rx={14} fill="none" stroke={ink} strokeWidth={4} strokeDasharray={2 * (w + h)} strokeDashoffset={2 * (w + h) * (1 - clamp(pop))} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: clamp((x0 + x1) / 2, edge, cw - edge),
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
