import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import type { FormatSpec } from "../formats";
import { borderOf, FRAMES, shadowOf } from "../frames";
import { camera, clamp, easeInOut, focusOf, pointer, project, viewOf, type Camera, type Layout, type Pt, type Rect, type Take, type TakeEvent } from "../motion";
import { useShowcase, useSurface, Words } from "../parts";
import type { Surface } from "../styles";
import type { Scene } from "../types";

type Say = Extract<TakeEvent, { type: "say" }>;
type Callout = Extract<TakeEvent, { type: "callout" }>;
type Speed = Extract<TakeEvent, { type: "speed" }>;
type Lift = Extract<TakeEvent, { type: "lift" }>;

const HANDOFF = 0.2; // seconds a caption takes to leave before the next one comes in
const SETTLE = 0.5; // seconds a lifted card takes to sink back into the page

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
 *  callouts ring what matters, lifts float a piece of the page out over the rest, captions narrate under
 *  it, and a badge owns up to every sped-up stretch. */
export function Screen({ scene, take, chapter }: { scene: Extract<Scene, { type: "screen" }>; take: Take; chapter?: string }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const { board, brand, style: S, spec } = useShowcase();
  const s = useSurface("stage");
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
  const overlays = <Overlays take={take} t={t} at={at} size={[v.w, v.h]} cursorSize={30 * L.k * cam.s} />;
  let said = -1;
  says.forEach((e, i) => {
    if (e.t <= t) said = i;
  });
  // in 16:9 the window grows over the bands as the camera pushes in: the headline steps aside and the
  // captions take a backing
  const pushed = win ? interpolate(cam.s, [1, 1.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  // a lift: how far its card has risen out of the page, 0 to 1; the page dims and blurs behind it
  const lifts = take.events.filter((e) => e.type === "lift" && e.t >= (scene.from ?? 0)) as Lift[];
  const lift = lifts.find((e) => t >= e.t && t < e.until + SETTLE);
  const raised = lift ? spring({ frame: (t - lift.t) * fps, fps, config: { damping: 200 }, durationInFrames: 24 }) * (1 - easeInOut(clamp((t - lift.until) / SETTLE))) : 0;
  const dim = raised > 0 && <AbsoluteFill style={{ background: `color-mix(in oklab, ${s.ground} ${Math.round(65 * raised)}%, transparent)`, backdropFilter: `blur(${(8 * raised).toFixed(2)}px)` }} />;
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
          {dim}
          <AbsoluteFill style={{ opacity: 1 - raised }}>{overlays}</AbsoluteFill>
        </>
      ) : (
        <div style={{ position: "absolute", left: v.x, top: v.y, width: v.w, height: v.h, transform: `translateY(${(1 - enter) * 80}px) scale(${0.96 + 0.04 * enter})`, opacity: clamp(enter * 1.6) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 28 * spec.type, overflow: "hidden", background: "#fff", border: borderOf(brand, s), boxShadow: shadowOf(brand, s) }}>
            <div style={lens}>
              <div style={{ position: "absolute", left: L.ox, top: L.oy }}>{video}</div>
            </div>
            {dim}
            <AbsoluteFill style={{ opacity: 1 - raised }}>{overlays}</AbsoluteFill>
          </div>
        </div>
      )}
      {lifts.map((e) => {
        const from = Math.round((e.t - (scene.from ?? 0)) * fps);
        return (
          <Sequence key={e.t} from={from} durationInFrames={Math.round((e.until + SETTLE - e.t) * fps)} premountFor={fps}>
            <LiftedCard e={e} raised={e === lift ? raised : 0} t={t} L={L} cam={cam} src={`takes/${scene.take}.mp4`} trimBefore={Math.round((scene.from ?? 0) * fps) + from} viewport={take.viewport} room={[spec.top, cap ? cap.y : H - spec.bottom]} />
          </Sequence>
        );
      })}
      {/* a sped-up stretch: top right of the frame, or on a card's top edge, clear of the app's own corners */}
      <SpeedBadge take={take} t={t} s={s} place={win ? { right: 56, top: 48 } : { left: v.x + v.w / 2, top: v.y, transform: "translate(-50%, -50%)" }} />
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
          {scene.kicker && !chip && <S.Kicker text={scene.kicker} color={s.muted} delay={Math.round(0.35 * fps)} />}
          <Words text={scene.title} size={(spec.reframe ? 84 : 62) * spec.type} delay={Math.round(0.45 * fps)} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 600 }} />
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
function Overlays(props: { take: Take; t: number; at: (p: Pt) => Pt; size: [number, number]; cursorSize: number }) {
  const { take, t, at, size, cursorSize } = props;
  const { fps } = useVideoConfig();
  const { brand, style: S } = useShowcase();
  const cursor = pointer(take.events, t);
  const callouts = take.events.filter((e) => e.type === "callout" && t >= e.t && t < e.until + 0.3) as Callout[];
  return (
    <AbsoluteFill>
      {callouts.map((e) => {
        const [x0, y0] = at([e.box.x, e.box.y]);
        const [x1, y1] = at([e.box.x + e.box.w, e.box.y + e.box.h]);
        const pop = spring({ frame: Math.max(0, (t - e.t) * fps), fps, config: { damping: 16, stiffness: 170 } });
        return <S.Callout key={e.t} text={e.text} box={{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }} view={{ w: size[0], h: size[1] }} pop={pop} out={clamp((t - e.until) / 0.3)} />;
      })}
      {cursor && <Cursor cursor={cursor} at={at} size={cursorSize} ink={brand.colors.ink} />}
    </AbsoluteFill>
  );
}

function SpeedBadge({ take, t, s, place }: { take: Take; t: number; s: Surface; place: CSSProperties }) {
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
        background: s.text,
        color: s.ground,
        fontSize: 26,
        fontWeight: 600,
        opacity: clamp((t - speed.t) / 0.25) * (1 - clamp((t - speed.until + 0.25) / 0.25)),
      }}
    >
      <svg width="26" height="16" viewBox="0 0 26 16">
        <path d="M1 1l11 7-11 7zM13 1l11 7-11 7z" fill={s.ground} />
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

/** A lifted piece of the page: a second copy of the take, cut to the lift's box, rises from where the box
 *  sits to float in the middle of `room` (the space between the safe area and the captions), tilted, as
 *  large as fits and still sharp, with the lift's line under it. raised: 0 (in the page) to 1 (afloat). */
function LiftedCard(props: { e: Lift; raised: number; t: number; L: Layout; cam: Camera; src: string; trimBefore: number; viewport: Take["viewport"]; room: [number, number] }) {
  const { e, raised, t, L, cam, src, trimBefore, viewport, room } = props;
  const { width: W, height: H } = useVideoConfig();
  const { spec } = useShowcase();
  const s = useSurface("stage");
  // 8 px of the page around the box, so the element's own border and rounded corners come along whole
  const box = { x: e.box.x - 8, y: e.box.y - 8, w: e.box.w + 16, h: e.box.h + 16 };
  const text = e.text ? Math.round((spec.reframe ? 64 : 52) * spec.type) : 0; // the line's type size
  const [top, bottom] = [room[0] + 24, room[1] - 24 - (text ? 1.3 * text + 32 : 0)];
  // afloat: 62% of the frame across (86% in portrait), within the room, and at most 2.4 px per CSS px
  const k1 = Math.min(((H > W ? 0.86 : 0.62) * W) / box.w, (bottom - top) / box.h, 2.4);
  const [x0, y0] = project([box.x, box.y], L, cam);
  const k0 = L.k * cam.s;
  const k = k0 + (k1 - k0) * raised;
  const cx = x0 + (box.w * k0) / 2 + (W / 2 - x0 - (box.w * k0) / 2) * raised;
  const cy = y0 + (box.h * k0) / 2 + ((top + bottom) / 2 - y0 - (box.h * k0) / 2) * raised;
  const sway = Math.sin(t * 1.1) * raised;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - (box.w * k) / 2,
          top: cy - (box.h * k) / 2,
          width: box.w * k,
          height: box.h * k,
          overflow: "hidden",
          borderRadius: 16 * raised,
          background: "#fff",
          boxShadow: `0 ${40 * raised}px ${90 * raised}px -30px rgba(0,0,0,${(0.5 * raised).toFixed(3)})${s.glow ? `, 0 0 ${80 * raised}px ${s.glow}` : ""}`,
          transform: `perspective(1600px) rotateX(${4 * raised}deg) rotateY(${-6 * raised + 2 * sway}deg) translateY(${-8 * sway}px)`,
          visibility: raised > 0 ? "visible" : "hidden",
        }}
      >
        <Video src={staticFile(src)} trimBefore={trimBefore} muted style={{ position: "absolute", left: -box.x * k, top: -box.y * k, width: viewport.width * k, height: viewport.height * k, maxWidth: "none" }} />
      </div>
      {e.text && (
        <div style={{ position: "absolute", left: 0, width: W, top: cy + (box.h * k1) / 2 + 32, display: "flex", justifyContent: "center", padding: `0 ${spec.padX}px`, opacity: raised }}>
          <Words text={e.text} size={text} delay={8} color={s.text} mark={s.mark} accentColor={s.em} glow={s.glow} style={{ fontWeight: 600 }} />
        </div>
      )}
    </>
  );
}
