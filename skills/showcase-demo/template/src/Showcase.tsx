import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { blocks } from "./blocks";
import { sans } from "./fonts";
import { FORMATS } from "./formats";
import { clamp, type Take } from "./motion";
import { ShowcaseContext } from "./parts";
import { SECONDS } from "./scenes";
import { resolveStyle } from "./styles";
import { onBeat, startsOf } from "./timing";
import type { Board, Enter, Format, Scene } from "./types";

// public/showcase.json drives everything; each screen scene plays public/takes/<take>.mp4 and follows
// public/takes/<take>.json, both written by record.mjs.
export type ShowcaseProps = { storyboard: string; format: Format; board?: Board; takes?: Record<string, Take> };

export const TRANSITION = 0.6; // seconds that neighbouring scenes overlap

export const seconds = (s: Scene, takes: Record<string, Take>) =>
  s.type === "screen" ? (s.to ?? takes[s.take].duration) - (s.from ?? 0) : (s.seconds ?? SECONDS[s.type]);

// Each scene's length in frames: its seconds, with the cuts moved onto the music's beat when the board has one.
export function lengthsOf(board: Board, takes: Record<string, Take>, fps: number) {
  const lengths = board.scenes.map((s) => Math.round(seconds(s, takes) * fps));
  const overlap = Math.round(TRANSITION * fps);
  return board.beat ? onBeat(lengths, board.scenes.map((s) => s.type !== "screen"), overlap, fps, board.beat) : lengths;
}

export async function getJSON<T>(file: string): Promise<T> {
  const res = await fetch(staticFile(file), { cache: "no-store" });
  if (!res.ok) throw new Error(`public/${file}: ${res.status}`);
  return res.json();
}

export const load: CalculateMetadataFunction<ShowcaseProps> = async ({ props }) => {
  const all = await getJSON<Board>(props.storyboard);
  const board = { ...all, scenes: all.scenes.filter((s) => !s.only || s.only.includes(props.format)) };
  resolveStyle(board.style); // an unknown style fails here, with the names that exist
  const takes: Record<string, Take> = {};
  for (const s of board.scenes) if (s.type === "screen") takes[s.take] ??= await getJSON<Take>(`takes/${s.take}.json`);
  for (const s of board.scenes) {
    if (seconds(s, takes) < 2 * TRANSITION) throw new Error(`${s.type} scene is under ${2 * TRANSITION} s: ${JSON.stringify(s)}`);
  }
  const fps = board.fps ?? 30;
  const lengths = lengthsOf(board, takes, fps);
  const { width, height } = FORMATS[props.format];
  return {
    fps,
    width,
    height,
    durationInFrames: lengths.reduce((a, b) => a + b, 0) - (lengths.length - 1) * Math.round(TRANSITION * fps),
    props: { ...props, board, takes },
  };
};

// How a scene arrives over the last one. The iris and the clock wipe open round; push is a push-cut; blocks
// drop in one after another.
const arrival = (enter: Enter, width: number, height: number): TransitionPresentation<any> => {
  switch (enter) {
    case "slide":
      return slide({ direction: "from-bottom" });
    case "iris":
      return iris({ width, height });
    case "clock":
      return clockWipe({ width, height });
    case "push":
      return pushCut();
    case "blocks":
      return blocks();
    default:
      return fade();
  }
};

/** The film: the storyboard's scenes in order with a transition between each, the chapter chip over the
 *  screens and stats, and the music under it all. */
export function Timeline({ board, takes, format }: { board: Board; takes: Record<string, Take>; format: Format }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const style = resolveStyle(board.style);
  const { scenes } = board;
  const overlap = Math.round(TRANSITION * fps);
  const lengths = lengthsOf(board, takes, fps);
  const starts = startsOf(lengths, overlap);
  // the chapter in force at each scene: its own kicker, else the last one before it
  const chapters: (string | undefined)[] = [];
  scenes.forEach((s, i) => chapters.push(s.kicker ?? chapters[i - 1]));
  // The chip shows on screens and stats. It comes in at the start of each run of them in one chapter and
  // leaves in that run's last transition, so a change of chapter crossfades.
  const chips: { text: string; p: number }[] = [];
  const shows = (i: number) => board.chip !== false && !!chapters[i] && (scenes[i].type === "screen" || scenes[i].type === "stats");
  scenes.forEach((_, i) => {
    if (!shows(i) || (i > 0 && shows(i - 1) && chapters[i - 1] === chapters[i])) return;
    let j = i;
    while (j + 1 < scenes.length && shows(j + 1) && chapters[j + 1] === chapters[i]) j++;
    const end = starts[j] + lengths[j];
    if (frame < starts[i] || frame >= end) return;
    const p = spring({ frame: frame - starts[i] - overlap / 2, fps, config: { damping: 200 } });
    chips.push({ text: chapters[i]!, p: Math.min(p, clamp((end - frame) / overlap)) });
  });
  return (
    <ShowcaseContext.Provider value={{ board, brand: board.brand, style, format, spec: FORMATS[format] }}>
      <AbsoluteFill style={{ fontFamily: sans, background: board.brand.colors.paper }}>
        <TransitionSeries>
          {scenes.flatMap((scene, i) => {
            const Draw = style.scenes[scene.type];
            const enter = scene.enter ?? style.enter[scene.type] ?? "fade";
            return [
              ...(i > 0
                ? [
                    <TransitionSeries.Transition
                      key={`t${i}`}
                      timing={springTiming({ config: { damping: 200 }, durationInFrames: overlap })}
                      presentation={arrival(enter, width, height)}
                    />,
                  ]
                : []),
              <TransitionSeries.Sequence key={i} durationInFrames={lengths[i]} premountFor={fps}>
                <Draw scene={scene as never} take={(scene.type === "screen" ? takes[scene.take] : undefined) as never} chapter={chapters[i]} />
              </TransitionSeries.Sequence>,
            ];
          })}
        </TransitionSeries>
        {chips.map((c) => (
          <style.Chip key={c.text} text={c.text} p={c.p} />
        ))}
        {board.sfx &&
          effects(board, takes, starts, fps).map((x, i) => (
            <Sequence key={i} from={x.frame} durationInFrames={fps} layout="none">
              <Audio src={staticFile(`sfx/${x.sound}.wav`)} volume={x.volume} />
            </Sequence>
          ))}
        {board.music && (
          <Audio
            src={staticFile(board.music)}
            volume={(f) => interpolate(f, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        )}
      </AbsoluteFill>
    </ShowcaseContext.Provider>
  );
}

// The sound effects (public/sfx/, which studio.sh makes): a whoosh as each scene comes in, a click on each
// click in a take, and a pop as each callout or lift lands.
function effects(board: Board, takes: Record<string, Take>, starts: number[], fps: number) {
  const out: { frame: number; sound: "whoosh" | "click" | "pop"; volume: number }[] = [];
  board.scenes.forEach((s, i) => {
    if (i > 0) out.push({ frame: starts[i], sound: "whoosh", volume: 0.3 });
    if (s.type !== "screen") return;
    const [from, to] = [s.from ?? 0, s.to ?? takes[s.take].duration];
    for (const e of takes[s.take].events) {
      if (e.t < from || e.t >= to) continue;
      const frame = starts[i] + Math.round((e.t - from) * fps);
      if (e.type === "click") out.push({ frame, sound: "click", volume: 0.55 });
      if (e.type === "callout" || e.type === "lift") out.push({ frame, sound: "pop", volume: 0.45 });
    }
  });
  return out;
}

export function Showcase({ board, takes, format }: ShowcaseProps) {
  if (!board || !takes) return null;
  return <Timeline board={board} takes={takes} format={format} />;
}
