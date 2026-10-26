import { AbsoluteFill, Composition, interpolate, staticFile, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { sans } from "./fonts";
import type { Take } from "./motion";
import { Intro, Outro, Screen, Stats, Title, type Brand, type Scene } from "./scenes";

// public/showcase.json: the brand, the scenes in order, and optional music. Each screen scene plays
// public/takes/<take>.mp4 and follows public/takes/<take>.json, both written by record.mjs.
export type Board = { brand: Brand; scenes: Scene[]; music?: string; fps?: number; width?: number; height?: number };
type Props = { storyboard: string; board?: Board; takes?: Record<string, Take> };

const TRANSITION = 0.6; // seconds that neighbouring scenes overlap
const SECONDS = { intro: 3, title: 2, stats: 3.2, outro: 4 };

// How a scene arrives over the last one: its `enter`, else a slide for screens and a fade for the rest.
const arrival = (scene: Scene, width: number, height: number): TransitionPresentation<any> => {
  switch (scene.enter ?? (scene.type === "screen" ? "slide" : "fade")) {
    case "slide":
      return slide({ direction: "from-bottom" });
    case "iris":
      return iris({ width, height });
    case "clock":
      return clockWipe({ width, height });
    case "push":
      return pushCut();
    default:
      return fade();
  }
};

const seconds = (s: Scene, takes: Record<string, Take>) =>
  s.type === "screen" ? (s.to ?? takes[s.take].duration) - (s.from ?? 0) : (s.seconds ?? SECONDS[s.type]);

const load: CalculateMetadataFunction<Props> = async ({ props }) => {
  const get = async (file: string) => {
    const res = await fetch(staticFile(file), { cache: "no-store" });
    if (!res.ok) throw new Error(`public/${file}: ${res.status}`);
    return res.json();
  };
  const board: Board = await get(props.storyboard);
  const takes: Record<string, Take> = {};
  for (const s of board.scenes) if (s.type === "screen") takes[s.take] ??= await get(`takes/${s.take}.json`);
  const fps = board.fps ?? 30;
  for (const s of board.scenes) {
    if (seconds(s, takes) < 2 * TRANSITION) throw new Error(`${s.type} scene is under ${2 * TRANSITION} s: ${JSON.stringify(s)}`);
  }
  const frames = board.scenes.map((s) => Math.round(seconds(s, takes) * fps));
  return {
    fps,
    width: board.width ?? 1920,
    height: board.height ?? 1080,
    durationInFrames: frames.reduce((a, b) => a + b, 0) - (frames.length - 1) * Math.round(TRANSITION * fps),
    props: { ...props, board, takes },
  };
};

function Showcase({ board, takes }: Props) {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  if (!board || !takes) return null;
  const { brand } = board;
  const overlap = Math.round(TRANSITION * fps);
  return (
    <AbsoluteFill style={{ fontFamily: sans, background: brand.colors.paper }}>
      <TransitionSeries>
        {board.scenes.flatMap((scene, i) => [
          ...(i > 0
            ? [
                <TransitionSeries.Transition
                  key={`t${i}`}
                  timing={springTiming({ config: { damping: 200 }, durationInFrames: overlap })}
                  presentation={arrival(scene, width, height)}
                />,
              ]
            : []),
          <TransitionSeries.Sequence key={i} durationInFrames={Math.round(seconds(scene, takes) * fps)} premountFor={fps}>
            {scene.type === "intro" ? (
              <Intro brand={brand} />
            ) : scene.type === "title" ? (
              <Title scene={scene} brand={brand} />
            ) : scene.type === "screen" ? (
              <Screen scene={scene} take={takes[scene.take]} brand={brand} />
            ) : scene.type === "stats" ? (
              <Stats scene={scene} brand={brand} />
            ) : (
              <Outro scene={scene} brand={brand} />
            )}
          </TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      {board.music && (
        <Audio
          src={staticFile(board.music)}
          volume={(f) => interpolate(f, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
    </AbsoluteFill>
  );
}

export const Root = () => (
  <Composition
    id="Showcase"
    component={Showcase}
    calculateMetadata={load}
    defaultProps={{ storyboard: "showcase.json" } as Props}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
  />
);
