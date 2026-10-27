// The motion of a recorded take, as pure functions of its time t (seconds): where the camera looks
// and where the cursor is. record.mjs logs the events; scenes/screen.tsx draws them. No Remotion
// imports, so test.sh can run this file with plain Node.

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
export type Rect = Box;
// Positions are CSS px in the recorded viewport; times are seconds on the take video's clock.
export type TakeEvent =
  | { t: number; type: "move"; from: Pt; to: Pt; dur: number }
  | { t: number; type: "click"; at: Pt }
  | { t: number; type: "type"; until: number }
  | { t: number; type: "zoom"; box?: Box; scale?: number }
  | { t: number; type: "callout"; box: Box; text: string; until: number }
  | { t: number; type: "speed"; rate: number; until: number }
  | { t: number; type: "say"; text: string };
export type Take = { viewport: { width: number; height: number }; duration: number; events: TakeEvent[] };
// Where the viewport sits on a W×H stage: viewport point p is at stage point (ox, oy) + p·k. The camera
// shows the stage through `view` (default: the whole frame) and never past `bounds` (default: the whole
// stage). It rests at zoom 1 on viewport point `rest` (default: the view's centre). With `follow`
// (reframed formats) it also pans, just far enough, to keep the cursor's targets and the callouts in sight.
export type Layout = { W: number; H: number; ox: number; oy: number; k: number; view?: Rect; bounds?: Rect; follow?: boolean; rest?: Pt };
// The camera: zoom s, with stage point (x, y) at the centre of the view.
export type Camera = { s: number; x: number; y: number };

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const glide = (p: number) => p ** 3 * (p * (p * 6 - 15) + 10); // softer at both ends, for the camera

export const ZOOM_SECONDS = 1;
const MAX_ZOOM = 1.8;
const LEAST = 600; // CSS px: the narrowest a reframed card shows a desktop page, at rest or zoomed

export const viewOf = (L: Layout): Rect => L.view ?? { x: 0, y: 0, w: L.W, h: L.H };
const boundsOf = (L: Layout): Rect => L.bounds ?? { x: 0, y: 0, w: L.W, h: L.H };
// The view stays inside the bounds, so no edge of the frame ever shows past them.
const contain = (c: Camera, L: Layout): Camera => {
  const v = viewOf(L);
  const b = boundsOf(L);
  const axis = (at: number, lo: number, span: number, size: number) => {
    const half = size / (2 * c.s);
    return 2 * half >= span ? lo + span / 2 : clamp(at, lo + half, lo + span - half);
  };
  return { s: c.s, x: axis(c.x, b.x, b.w, v.w), y: axis(c.y, b.y, b.h, v.h) };
};
const home = (L: Layout): Camera => {
  const v = viewOf(L);
  const [x, y] = L.rest ? stage(L, L.rest) : [v.x + v.w / 2, v.y + v.h / 2];
  return contain({ s: 1, x, y }, L);
};
const stage = (L: Layout, [x, y]: Pt): Pt => [L.ox + x * L.k, L.oy + y * L.k];
// The camera position nearest `at` that keeps lo..hi in sight, `half` either side of it; a span too big for
// that is centred, or read from its start.
const keep = (at: number, lo: number, hi: number, half: number, start = false) =>
  hi - lo > 2 * half ? (start ? lo + half : (lo + hi) / 2) : clamp(at, hi - half, lo + half);

/** Where a take's action is, in its viewport: around every zoom and callout box and every place the
 *  cursor goes, padded, at least `least` px across; the whole viewport when nothing happens. A reframed
 *  card is cut to it. */
export function focusOf(take: Take, pad = 40, least = LEAST): Box {
  const { width: vw, height: vh } = take.viewport;
  const boxes = take.events.flatMap((e) => (e.type === "move" ? [{ x: e.to[0], y: e.to[1], w: 0, h: 0 }] : (e.type === "zoom" || e.type === "callout") && e.box ? [e.box] : []));
  if (!boxes.length) return { x: 0, y: 0, w: vw, h: vh };
  const [x0, x1] = [Math.min(...boxes.map((b) => b.x)), Math.max(...boxes.map((b) => b.x + b.w))];
  const [y0, y1] = [Math.min(...boxes.map((b) => b.y)), Math.max(...boxes.map((b) => b.y + b.h))];
  const w = Math.min(vw, Math.max(least, x1 - x0 + 2 * pad));
  const h = Math.min(vh, y1 - y0 + 2 * pad);
  return { x: clamp((x0 + x1 - w) / 2, 0, vw - w), y: clamp((y0 + y1 - h) / 2, 0, vh - h), w, h };
}

/** The camera a zoom asks for: its box at most 70% of the view, up to 1.8× unless `scale` says, never so
 *  close that the box spills out of the view (a box taller than it is read from the top), and when
 *  reframed, never closer than LEAST px across and as near rest as keeps the box in sight. No box: rest. */
export function aim(e: { box?: Box; scale?: number }, L: Layout): Camera {
  if (!e.box) return home(L);
  const v = viewOf(L);
  const { x, y, w, h } = e.box;
  const fill = Math.min(v.w / (w * L.k), v.h / (h * L.k)); // the zoom at which the box just fills the view
  const s = Math.max(1, Math.min(e.scale ?? Math.min(MAX_ZOOM, 0.7 * fill), 0.9 * fill, L.follow ? v.w / (LEAST * L.k) : Infinity));
  const [x0, y0] = stage(L, [x, y]);
  const [x1, y1] = stage(L, [x + w, y + h]);
  const near = L.follow ? home(L) : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return contain({ s, x: keep(near.x, x0, x1, (0.45 * v.w) / s), y: keep(near.y, y0, y1, (0.45 * v.h) / s, true) }, L);
}

// Where an event sends the camera, given where it's headed (`to`), or null when it leaves it be.
function goal(e: TakeEvent, to: Camera, L: Layout): Camera | null {
  if (e.type === "zoom") return aim(e, L);
  if (!L.follow) return null;
  // reframed, a push-in eases back out on the click it came for, to show what the click opens
  if (e.type === "click") return to.s > 1 ? home(L) : null;
  if (e.type !== "move" && e.type !== "callout") return null;
  // pan just far enough that the target is in the view, 5% in from its edges
  const v = viewOf(L);
  const b = e.type === "move" ? { x: e.to[0], y: e.to[1], w: 0, h: 0 } : e.box;
  const [x0, y0] = stage(L, [b.x, b.y]);
  const [x1, y1] = stage(L, [b.x + b.w, b.y + b.h]);
  const [x, y] = [keep(to.x, x0, x1, (0.45 * v.w) / to.s), keep(to.y, y0, y1, (0.45 * v.h) / to.s, true)];
  return x === to.x && y === to.y ? null : contain({ s: to.s, x, y }, L);
}

/** The camera at take time t: it rests at home, and each zoom (and, with `follow`, each click while pushed
 *  in, and each move or callout that would land out of sight) glides it from wherever it is to where that
 *  event wants it. */
export function camera(events: TakeEvent[], t: number, L: Layout): Camera {
  let [from, to, t0] = [home(L), home(L), -Infinity];
  const at = (s: number): Camera => {
    const p = glide(clamp((s - t0) / ZOOM_SECONDS));
    return { s: from.s ** (1 - p) * to.s ** p, x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
  };
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.t > t) break;
    const next = goal(e, to, L);
    if (next) [from, to, t0] = [at(e.t), next, e.t];
  }
  return contain(at(t), L);
}

/** Where a viewport point lands in the frame, through the layout and the camera. */
export const project = (p: Pt, L: Layout, c: Camera): Pt => {
  const v = viewOf(L);
  const [x, y] = stage(L, p);
  return [(x - c.x) * c.s + v.x + v.w / 2, (y - c.y) * c.s + v.y + v.h / 2];
};

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
