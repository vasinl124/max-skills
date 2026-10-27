import { Series, type CalculateMetadataFunction } from "remotion";
import type { Take } from "./motion";
import { getJSON, seconds, Timeline, TRANSITION } from "./Showcase";
import { STYLES } from "./styles";
import type { Board, Brand, Scene } from "./types";

// Every style in styles/index.ts, one after another, each through the same short run of scenes with its
// own transitions: a light title, a slice of the storyboard's first take that has a callout (when there's
// a storyboard with takes), a dark title, a stats beat and an outro, in the storyboard's brand. Render it
// after adding or changing a style.
const BRAND: Brand = { name: "Sampler", url: "example.com", colors: { paper: "#fcfcf9", ink: "#1c1b15", accent: "#fef1a1", muted: "#626055" } };
const sample = (style: string, screen?: Scene): Scene[] => [
  { type: "title", kicker: `Style · ${style}`, text: "Every style, *side by side.*", seconds: 1.8 },
  ...(screen ? [{ ...screen, kicker: `Style · ${style}` }] : []),
  { type: "title", text: "Dark titles *too.*", theme: "dark", seconds: 1.8 },
  { type: "stats", kicker: `Style · ${style}`, items: [{ value: "3", label: "steps" }, { value: "1", label: "click" }, { value: "0", label: "setup" }], seconds: 2.6 },
  { type: "outro", text: "Try it *today.*", seconds: 2.4 },
];
const FPS = 30;
const length = (scenes: Scene[], takes: Record<string, Take>) =>
  scenes.reduce((a, s) => a + Math.round(seconds(s, takes) * FPS), 0) - (scenes.length - 1) * Math.round(TRANSITION * FPS);

type SamplerProps = { storyboard: string; brand?: Brand; screen?: Scene; takes?: Record<string, Take> };

export const loadSampler: CalculateMetadataFunction<SamplerProps> = async ({ props }) => {
  const board = await getJSON<Board>(props.storyboard).catch(() => null);
  let screen: Scene | undefined;
  let takes: Record<string, Take> = {};
  // 3.6 s of a take around its first callout, else its opening
  for (const s of board?.scenes ?? []) {
    if (s.type !== "screen") continue;
    const take = await getJSON<Take>(`takes/${s.take}.json`).catch(() => null);
    if (!take) continue;
    const callout = take.events.find((e) => e.type === "callout");
    const from = callout ? Math.max(0, Math.min(callout.t - 1.2, take.duration - 3.6)) : 0;
    if (!screen || callout) [screen, takes] = [{ type: "screen", take: s.take, title: s.title, from, to: Math.min(take.duration, from + 3.6) }, { [s.take]: take }];
    if (callout) break;
  }
  const each = length(sample("", screen), takes);
  return { durationInFrames: each * Object.keys(STYLES).length, props: { ...props, brand: board?.brand ?? BRAND, screen, takes } };
};

export function Sampler({ brand = BRAND, screen, takes = {} }: SamplerProps) {
  const each = length(sample("", screen), takes);
  return (
    <Series>
      {Object.keys(STYLES).map((style) => (
        <Series.Sequence key={style} durationInFrames={each}>
          <Timeline board={{ brand, style, scenes: sample(style, screen) }} takes={takes} format="16:9" />
        </Series.Sequence>
      ))}
    </Series>
  );
}
