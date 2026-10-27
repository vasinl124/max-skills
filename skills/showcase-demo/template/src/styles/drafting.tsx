import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { mono } from "../fonts";
import { clamp } from "../motion";
import { Chip, useShowcase, useSpring, useSurface, type CalloutProps, type ChipProps, type KickerProps } from "../parts";
import type { Style, Tone } from ".";

// drafting: the brand on a drafting table. A fine grid with registration marks at the corners, and a
// crosshair drifting across it with its coordinates; on ink it reads as a blueprint. Kickers and the chip
// are set in mono, callouts are leader-line notes, and titles, stats and the outro drop in as blocks.

const line = (color: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, transparent)`;

function Backdrop({ tone, quiet }: { tone: Tone; quiet?: boolean }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = useSurface(tone);
  const t = frame / fps;
  const [minor, major] = [line(s.text, quiet ? 4 : 6), line(s.text, quiet ? 8 : 12)];
  // the crosshair wanders a slow loop over the right half, where titles rarely reach
  const [cx, cy] = [Math.round(width * (0.72 + 0.12 * Math.sin(t / 4))), Math.round(height * (0.62 + 0.14 * Math.sin(t / 3.1 + 1)))];
  const mark = line(s.text, 45);
  return (
    <AbsoluteFill style={{ background: s.ground, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: [major, major, minor, minor].map((c, i) => `linear-gradient(to ${i % 2 ? "bottom" : "right"}, ${c} 1px, transparent 1px)`).join(", "),
          backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
          backgroundPosition: "center",
        }}
      />
      {/* registration marks, 40 px in from each corner */}
      {[
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([right, bottom], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            [right ? "right" : "left"]: 40,
            [bottom ? "bottom" : "top"]: 40,
            width: 28,
            height: 28,
            [right ? "borderRight" : "borderLeft"]: `1.5px solid ${mark}`,
            [bottom ? "borderBottom" : "borderTop"]: `1.5px solid ${mark}`,
          }}
        />
      ))}
      <svg width={64} height={64} viewBox="-32 -32 64 64" style={{ position: "absolute", left: cx - 32, top: cy - 32 }}>
        <path d="M-32 0H-8M8 0H32M0 -32V-8M0 8V32" stroke={mark} strokeWidth={1.5} />
        <circle r={8} fill="none" stroke={mark} strokeWidth={1.5} />
      </svg>
      <div style={{ position: "absolute", left: cx + 26, top: cy + 14, fontFamily: mono, fontSize: 15, letterSpacing: "0.1em", color: mark }}>
        X {String(cx).padStart(4, "0")} · Y {String(cy).padStart(4, "0")}
      </div>
    </AbsoluteFill>
  );
}

/** A kicker as a drafting label: a rule that draws out, then the chapter in spaced mono capitals. */
function Kicker({ text, color, delay = 0, size = 22 }: KickerProps) {
  const p = useSpring(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.6, fontFamily: mono, fontSize: size * 0.95, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
      <span style={{ width: size * 2.2 * p, height: 1.5, background: color }} />
      <span style={{ opacity: p }}>{text}</span>
    </div>
  );
}

// the chip as a square-cornered label in mono
function MonoChip(props: ChipProps) {
  const s = useSurface("paper");
  return <Chip {...props} skin={{ borderRadius: 2, fontFamily: mono, fontWeight: 500, background: line(s.ground, 92), border: `1px solid ${line(s.text, 45)}`, color: s.text }} />;
}

/** A leader-line note: corner ticks frame the target, then a line runs from it to a mono label beside it,
 *  or under it (over it) when the sides are too narrow. Mono type makes the label's width known. */
function Callout({ text, box, view, pop, out }: CalloutProps) {
  const { brand } = useShowcase();
  const { paper, ink } = brand.colors;
  const p = clamp(pop);
  const [x0, y0, x1, y1] = [box.x - 8, box.y - 8, box.x + box.w + 8, box.y + box.h + 8];
  const fs = 24;
  const [lw, lh] = [text.length * 0.6 * fs + 28, fs * 1.25 + 16];
  // where the leader runs: from the box out 36 px on the diagonal, then 60 px level, to the label
  let path: [number, number][];
  let lx: number;
  if (view.w - x1 - 110 >= lw) {
    path = [[x1, y0 + 20], [x1 + 36, y0 - 16], [x1 + 96, y0 - 16]];
    lx = x1 + 104;
  } else if (x0 - 110 >= lw) {
    path = [[x0, y0 + 20], [x0 - 36, y0 - 16], [x0 - 96, y0 - 16]];
    lx = x0 - 104 - lw;
  } else {
    const under = view.h - y1 - 60 >= lh;
    const [sx, sy] = [Math.max(x0 + 24, 12), under ? y1 : y0];
    const dy = under ? 36 : -36;
    path = [[sx, sy], [sx + 36, sy + dy], [sx + 96, sy + dy]];
    lx = clamp(sx + 104, 12, view.w - lw - 12);
  }
  // the label never leaves the view: when the box fills it, the label comes in over the box's edge
  const ly = clamp(path[2][1] - lh / 2, 12, view.h - lh - 12);
  path[1][1] += ly + lh / 2 - path[2][1];
  path[2][1] = ly + lh / 2;
  const length = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) + Math.abs(path[2][0] - path[1][0]);
  const lead = clamp((p - 0.35) / 0.4);
  const tick = (x: number, y: number, dx: number, dy: number) => `M${x + 14 * dx} ${y}H${x}V${y + 14 * dy}`;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <svg width={view.w} height={view.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <path d={[tick(x0, y0, 1, 1), tick(x1, y0, -1, 1), tick(x0, y1, 1, -1), tick(x1, y1, -1, -1)].join("")} fill="none" stroke={ink} strokeWidth={3} opacity={p} />
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={ink} strokeWidth={1.25} strokeDasharray="6 6" opacity={0.6 * p} />
        <circle cx={path[0][0]} cy={path[0][1]} r={5} fill={ink} opacity={lead > 0 ? 1 : 0} />
        <polyline points={path.map((q) => q.join(",")).join(" ")} fill="none" stroke={ink} strokeWidth={2} strokeDasharray={length} strokeDashoffset={length * (1 - lead)} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: lx,
          top: ly,
          width: lw,
          height: lh,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: paper,
          border: `1.5px solid ${ink}`,
          borderRadius: 2,
          fontFamily: mono,
          fontSize: fs,
          fontWeight: 500,
          color: ink,
          whiteSpace: "nowrap",
          opacity: clamp((p - 0.7) / 0.3),
          transform: `translateY(${(1 - clamp((p - 0.7) / 0.3)) * 6}px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

export const drafting: Style = { Backdrop, enter: { screen: "slide", title: "blocks", stats: "blocks", outro: "blocks" }, Kicker, Chip: MonoChip, Callout };
