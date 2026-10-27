import { Series, type CalculateMetadataFunction } from "remotion";
import { getJSON, seconds, Timeline, TRANSITION } from "./Showcase";
import { STYLES } from "./styles";
import type { Board, Brand, Scene } from "./types";

// Every style in styles/index.ts, one after another, each in the same short run of scenes that need no
// takes: a light title, a dark title, a stats beat and an outro, in the storyboard's brand when there is
// one. Render it after adding or changing a style.
const BRAND: Brand = { name: "Sampler", url: "example.com", colors: { paper: "#fcfcf9", ink: "#1c1b15", accent: "#fef1a1", muted: "#626055" } };
const sample = (style: string): Scene[] => [
  { type: "title", kicker: `Style · ${style}`, text: "Every style, *side by side.*", seconds: 1.8 },
  { type: "title", text: "Dark titles *too.*", theme: "dark", enter: "clock", seconds: 1.8 },
  { type: "stats", kicker: `Style · ${style}`, items: [{ value: "3", label: "steps" }, { value: "1", label: "click" }, { value: "0", label: "setup" }], enter: "push", seconds: 2.6 },
  { type: "outro", text: "Try it *today.*", enter: "iris", seconds: 2.4 },
];
const FPS = 30;
const each = sample("").reduce((a, s) => a + Math.round(seconds(s, {}) * FPS), 0) - (sample("").length - 1) * Math.round(TRANSITION * FPS);

type SamplerProps = { storyboard: string; brand?: Brand };

export const loadSampler: CalculateMetadataFunction<SamplerProps> = async ({ props }) => {
  const brand = await getJSON<Board>(props.storyboard).then((b) => b.brand, () => BRAND);
  return { durationInFrames: each * Object.keys(STYLES).length, props: { ...props, brand } };
};

export function Sampler({ brand = BRAND }: SamplerProps) {
  return (
    <Series>
      {Object.keys(STYLES).map((style) => (
        <Series.Sequence key={style} durationInFrames={each}>
          <Timeline board={{ brand, style, scenes: sample(style) }} takes={{}} format="16:9" />
        </Series.Sequence>
      ))}
    </Series>
  );
}
