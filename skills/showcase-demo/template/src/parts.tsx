import { createContext, useContext, type CSSProperties } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { serif } from "./fonts";
import type { FormatSpec } from "./formats";
import { clamp } from "./motion";
import type { ResolvedStyle, Surface, Tone } from "./styles";
import type { Board, Brand, Format } from "./types";

// What every scene and style can read: the storyboard, its brand, the style in force and the format.
export type ShowcaseInfo = { board: Board; brand: Brand; style: ResolvedStyle; format: Format; spec: FormatSpec };
export const ShowcaseContext = createContext<ShowcaseInfo | null>(null);
export function useShowcase(): ShowcaseInfo {
  const info = useContext(ShowcaseContext);
  if (!info) throw new Error("useShowcase() outside a <Timeline>");
  return info;
}

/** The colours to draw with on a background of this tone, in the style in force. */
export const useSurface = (tone: Tone): Surface => {
  const { style, brand } = useShowcase();
  return style.surface(tone, brand.colors);
};

export const useSpring = (delay = 0, config: { damping?: number; stiffness?: number } = { damping: 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

// "Every quote is *real.*" → words, with the *starred* ones marked as the accent. glue: no space before it
// ("*Not in those words*, but": the comma).
export const parse = (text: string) => {
  const words: { word: string; accent: boolean; glue: boolean }[] = [];
  let gap = true;
  text.split("*").forEach((part, i) =>
    part.split(/(\s+)/).forEach((bit) => {
      if (/^\s/.test(bit)) gap = true;
      else if (bit) words.push({ word: bit, accent: i % 2 === 1, glue: !gap }), (gap = false);
    }),
  );
  return words;
};

/** Text that arrives a word at a time, rising out of a blur. *Starred* words are the accent: set in the
 *  serif's italic, over a marker stroke that draws in once the line has landed, or in `accentColor` with
 *  any `glow` behind them. */
export function Words(props: { text: string; size: number; color: string; delay?: number; mark?: string; accentColor?: string; glow?: string; style?: CSSProperties }) {
  const { text, size, color, delay = 0, mark, accentColor, glow, style } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = parse(text);
  const swipe = (i: number) => {
    const before = words.slice(0, i).filter((w) => w.accent).length; // accent words already struck
    return spring({ frame: frame - delay - words.length * 3 - 8 - before * 4, fps, config: { damping: 200 } });
  };
  return (
    <div style={{ fontSize: size, lineHeight: 1.08, letterSpacing: "-0.045em", color, textAlign: "center", textWrap: "balance", ...style }}>
      {words.map(({ word, accent, glue }, i) => {
        const p = spring({ frame: frame - delay - i * 3, fps, config: { damping: 200 } });
        return (
          <span key={i}>
            {i > 0 && !glue && " "}
            <span
              style={{
                display: "inline-block",
                position: "relative",
                opacity: p,
                transform: `translateY(${(1 - p) * 0.45}em)`,
                filter: `blur(${(1 - p) * 10}px)`,
                ...(accent && { fontFamily: serif, fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em", color: accentColor ?? color, textShadow: glow && `0 0 0.45em ${glow}` }),
              }}
            >
              {accent && mark && (
                <span
                  style={{
                    position: "absolute",
                    // runs on under the space when the next word is accented too, so the stroke reads as one
                    inset: `0.2em ${words[i + 1]?.accent ? "-0.36em" : "-0.1em"} 0.04em -0.1em`,
                    background: mark,
                    borderRadius: "0.1em",
                    zIndex: -1,
                    transformOrigin: "left",
                    transform: `scaleX(${swipe(i)})`,
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

export type KickerProps = { text: string; color: string; delay?: number; size?: number };

/** A scene's chapter, small and spaced out above its words. */
export function Kicker({ text, color, delay = 0, size = 22 }: KickerProps) {
  const p = useSpring(delay);
  return (
    <div style={{ fontSize: size, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      {text}
    </div>
  );
}

// p: how far in it is, 0 (gone) to 1 (fully in). skin: styles that wrap this chip restyle it with it.
export type ChipProps = { text: string; p: number; skin?: CSSProperties };

/** The chapter chip: a small pill at the top that carries the chapter ("02 · Sources") through its screens. */
export function Chip({ text, p, skin }: ChipProps) {
  const { spec } = useShowcase();
  const s = useSurface("paper");
  const size = Math.round((spec.reframe ? 28 : 19) * Math.max(spec.type, 0.9));
  return (
    <div
      style={{
        position: "absolute",
        top: spec.chipY,
        ...(spec.reframe ? { left: "50%", transform: `translate(-50%, ${(1 - p) * -10}px)` } : { left: 36, transform: `translateY(${(1 - p) * -10}px)` }),
        opacity: p,
        padding: `${Math.round(size * 0.5)}px ${size}px`,
        borderRadius: 999,
        background: `color-mix(in oklab, ${s.ground} 88%, transparent)`,
        border: `1px solid color-mix(in oklab, ${s.text} 14%, transparent)`,
        color: s.muted,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...skin,
      }}
    >
      {text}
    </div>
  );
}

// age: seconds since the line came in (below 0 while the last one leaves). leaving: 0 while it's current,
// rising to 1 as the next replaces it. plate: 0 to 1 as the take grows in behind the line (16:9, when the
// camera pushes in), so it needs a backing to stay legible. skin: styles that wrap this caption restyle it with it.
export type CaptionProps = { text: string; age: number; leaving: number; plate: number; skin?: CSSProperties };

/** A line of narration under the take. Its words turn from faint to ink as they're read, and *starred*
 *  words take the serif's italic. */
export function Caption({ text, age, leaving, plate, skin }: CaptionProps) {
  const { spec } = useShowcase();
  const s = useSurface("stage");
  const enter = clamp(age / 0.25);
  return (
    <div
      style={{
        fontSize: Math.round((spec.reframe ? 56 : 40) * spec.type),
        fontWeight: 500,
        lineHeight: 1.25,
        letterSpacing: "-0.02em",
        textAlign: "center",
        textWrap: "balance",
        opacity: enter * (1 - leaving),
        transform: `translateY(${(1 - enter) * 12 - leaving * 16}px)`,
        padding: "0.2em 0.6em",
        borderRadius: "0.5em",
        background: `color-mix(in oklab, ${s.ground} ${Math.round(92 * plate)}%, transparent)`,
        boxShadow: `0 12px 32px -14px rgba(0,0,0,${(0.35 * plate).toFixed(3)})`,
        ...skin,
      }}
    >
      {parse(text).map(({ word, accent: a, glue }, i) => {
        const read = clamp((age - 0.1 - i * 0.09) / 0.25);
        return (
          <span key={i}>
            {i > 0 && !glue && " "}
            <span style={{ color: `color-mix(in oklab, ${a ? s.em : s.text} ${Math.round(26 + 74 * read)}%, transparent)`, ...(a && { fontFamily: serif, fontStyle: "italic", fontWeight: 400 }) }}>
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// box: the target, in the view's px. view: the view's size. pop: a spring from 0 that overshoots a little as it
// lands. out: 0, rising to 1 as the callout leaves.
export type CalloutProps = { text: string; box: { x: number; y: number; w: number; h: number }; view: { w: number; h: number }; pop: number; out: number };

/** A callout: a ring drawn around its target, and a pill under it (over it when there's no room below). */
export function Callout({ text, box, view, pop, out }: CalloutProps) {
  const { brand } = useShowcase();
  const { paper, ink } = brand.colors;
  const pad = 10;
  const [x0, y0, x1, y1] = [box.x, box.y, box.x + box.w, box.y + box.h];
  const w = box.w + 2 * pad;
  const h = box.h + 2 * pad;
  // under the target when there's room: what sits above it (a question, a header) is usually its context
  const above = y1 + pad + 100 > view.h && y0 > 150;
  const edge = Math.min(260, view.w / 2);
  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", left: x0 - pad, top: y0 - pad, overflow: "visible", opacity: 1 - out }}>
        <rect width={w} height={h} rx={14} fill="none" stroke={ink} strokeWidth={4} strokeDasharray={2 * (w + h)} strokeDashoffset={2 * (w + h) * (1 - clamp(pop))} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: clamp((x0 + x1) / 2, edge, view.w - edge),
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
        {text}
      </div>
    </>
  );
}
