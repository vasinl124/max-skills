import { createContext, useContext, type CSSProperties } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { serif } from "./fonts";
import type { FormatSpec } from "./formats";
import { clamp } from "./motion";
import type { ResolvedStyle } from "./styles";
import type { Board, Brand, Format } from "./types";

// What every scene and style can read: the storyboard, its brand, the style in force and the format.
export type ShowcaseInfo = { board: Board; brand: Brand; style: ResolvedStyle; format: Format; spec: FormatSpec };
export const ShowcaseContext = createContext<ShowcaseInfo | null>(null);
export function useShowcase(): ShowcaseInfo {
  const info = useContext(ShowcaseContext);
  if (!info) throw new Error("useShowcase() outside a <Timeline>");
  return info;
}

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
 *  serif's italic, over a marker stroke that draws in once the line has landed (or in `accentColor`). */
export function Words(props: { text: string; size: number; color: string; delay?: number; mark?: string; accentColor?: string; style?: CSSProperties }) {
  const { text, size, color, delay = 0, mark, accentColor, style } = props;
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
                ...(accent && { fontFamily: serif, fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em", color: accentColor ?? color }),
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

export function Kicker({ text, color, delay = 0, size = 22 }: { text: string; color: string; delay?: number; size?: number }) {
  const p = useSpring(delay);
  return (
    <div style={{ fontSize: size, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      {text}
    </div>
  );
}

// p: how far in it is, 0 (gone) to 1 (fully in)
export type ChipProps = { text: string; p: number };

/** The chapter chip: a small pill at the top that carries the chapter ("02 · Sources") through its screens. */
export function Chip({ text, p }: ChipProps) {
  const { brand, spec } = useShowcase();
  const { paper, ink, muted } = brand.colors;
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
        background: `color-mix(in oklab, ${paper} 88%, transparent)`,
        border: `1px solid color-mix(in oklab, ${ink} 14%, transparent)`,
        color: muted,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

// age: seconds since the line came in (below 0 while the last one leaves). leaving: 0 while it's current,
// rising to 1 as the next replaces it. plate: 0 to 1 as the take grows in behind the line (16:9, when the
// camera pushes in), so it needs a backing to stay legible.
export type CaptionProps = { text: string; age: number; leaving: number; plate: number };

/** A line of narration under the take. Its words turn from faint to ink as they're read, and *starred*
 *  words take the serif's italic. */
export function Caption({ text, age, leaving, plate }: CaptionProps) {
  const { brand, spec } = useShowcase();
  const { paper, ink, accent, stage = accent } = brand.colors;
  const fg = stage === ink ? paper : ink;
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
        background: `color-mix(in oklab, ${stage} ${Math.round(92 * plate)}%, transparent)`,
        boxShadow: `0 12px 32px -14px rgba(0,0,0,${(0.35 * plate).toFixed(3)})`,
      }}
    >
      {parse(text).map(({ word, accent: a, glue }, i) => {
        const read = clamp((age - 0.1 - i * 0.09) / 0.25);
        return (
          <span key={i}>
            {i > 0 && !glue && " "}
            <span style={{ color: `color-mix(in oklab, ${fg} ${Math.round(26 + 74 * read)}%, transparent)`, ...(a && { fontFamily: serif, fontStyle: "italic", fontWeight: 400 }) }}>
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
}
