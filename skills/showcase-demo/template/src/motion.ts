// The motion of a recorded take, as pure functions of its time t (seconds): where the camera looks
// and where the cursor is. record.mjs logs the events; Screen (scenes.tsx) draws them. No Remotion
// imports, so test.sh can run this file with plain Node.

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
// Positions are CSS px in the recorded viewport; times are seconds on the take video's clock.
export type TakeEvent =
  | { t: number; type: "move"; from: Pt; to: Pt; dur: number }
  | { t: number; type: "click"; at: Pt }
  | { t: number; type: "type"; until: number }
  | { t: number; type: "zoom"; box?: Box; scale?: number }
  | { t: number; type: "callout"; box: Box; text: string; until: number }
  | { t: number; type: "speed"; rate: number; until: number };
export type Take = { viewport: { width: number; height: number }; duration: number; events: TakeEvent[] };
// Where the viewport sits on a W×H stage: viewport point p is at stage point (ox, oy) + p·k.
export type Layout = { W: number; H: number; ox: number; oy: number; k: number };
// The camera: zoom s, with stage point (x, y) at the center of the frame.
export type Camera = { s: number; x: number; y: number };

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const glide = (p: number) => p ** 3 * (p * (p * 6 - 15) + 10); // softer at both ends, for the camera

export const ZOOM_SECONDS = 1;
const MAX_ZOOM = 1.8;

const home = (L: Layout): Camera => ({ s: 1, x: L.W / 2, y: L.H / 2 });
// The view stays inside the stage, so no edge of the frame ever shows past it.
const contain = (c: Camera, L: Layout): Camera => ({
  s: c.s,
  x: clamp(c.x, L.W / (2 * c.s), L.W - L.W / (2 * c.s)),
  y: clamp(c.y, L.H / (2 * c.s), L.H - L.H / (2 * c.s)),
});

/** The camera a zoom asks for: its box at most 70% of the frame, up to 1.8× unless `scale` says. No box: home. */
export function aim(e: { box?: Box; scale?: number }, L: Layout): Camera {
  if (!e.box) return home(L);
  const { x, y, w, h } = e.box;
  const s = Math.max(1, e.scale ?? Math.min(MAX_ZOOM, (0.7 * L.W) / (w * L.k), (0.7 * L.H) / (h * L.k)));
  return contain({ s, x: L.ox + (x + w / 2) * L.k, y: L.oy + (y + h / 2) * L.k }, L);
}

/** The camera at take time t: starting home, each zoom glides from wherever the camera is to its aim. */
export function camera(events: TakeEvent[], t: number, L: Layout): Camera {
  const zooms = events.filter((e) => e.type === "zoom" && e.t <= t) as Extract<TakeEvent, { type: "zoom" }>[];
  let cam = home(L);
  zooms.forEach((e, i) => {
    const p = glide(clamp(((zooms[i + 1]?.t ?? t) - e.t) / ZOOM_SECONDS));
    const to = aim(e, L);
    cam = { s: cam.s ** (1 - p) * to.s ** p, x: cam.x + (to.x - cam.x) * p, y: cam.y + (to.y - cam.y) * p };
  });
  return contain(cam, L);
}

/** Where a viewport point lands in the frame, through the layout and the camera. */
export const project = ([x, y]: Pt, L: Layout, c: Camera): Pt => [
  (L.ox + x * L.k - c.x) * c.s + L.W / 2,
  (L.oy + y * L.k - c.y) * c.s + L.H / 2,
];

/** The cursor's path, eased and slightly bent like a hand's. record.mjs moves the real mouse along a
 *  copy of it, so hover states land as the drawn cursor passes. */
export function along(from: Pt, to: Pt, p: number): Pt {
  const e = easeInOut(clamp(p));
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60, len * 0.12) * Math.sin(Math.PI * e);
  return [from[0] + dx * e - (dy / len) * bend, from[1] + dy * e + (dx / len) * bend];
}

export type Pointer = { at: Pt; opacity: number; press: number; ripple?: { at: Pt; p: number } };

export const IDLE = 2.5; // seconds still before the cursor fades away

/** The cursor at take time t: shown from its first move, pressed for a moment on each click (with a
 *  ripple), and out of the way while typing or once still for IDLE, until it moves again. */
export function pointer(events: TakeEvent[], t: number): Pointer | null {
  const past = events.filter((e) => e.t <= t);
  const moves = past.filter((e) => e.type === "move") as Extract<TakeEvent, { type: "move" }>[];
  const move = moves.at(-1);
  if (!move) return null;
  const prev = moves.at(-2);
  const click = past.filter((e) => e.type === "click").at(-1) as Extract<TakeEvent, { type: "click" }> | undefined;
  const typed = (after: number, until = t) => past.find((e) => e.type === "type" && e.t > after && e.t <= until);
  // it fades in on a move if it had gone: before the first move, after typing, or after sitting still
  const wasHidden = !prev || !!typed(prev.t, move.t) || move.t - (prev.t + prev.dur) > IDLE;
  const still = Math.max(move.t + move.dur, click && click.t > move.t ? click.t : 0);
  const hideAt = Math.min(typed(move.t)?.t ?? Infinity, still + IDLE);
  const since = click ? t - click.t : Infinity;
  return {
    at: along(move.from, move.to, (t - move.t) / move.dur),
    opacity: (wasHidden ? clamp((t - move.t) / 0.2) : 1) * (1 - clamp((t - hideAt) / 0.3)),
    press: since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0,
    ripple: click && since < 0.5 ? { at: click.at, p: since / 0.5 } : undefined,
  };
}
