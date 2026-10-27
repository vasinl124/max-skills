import { Composition } from "remotion";
import { FORMATS } from "./formats";
import { loadSampler, Sampler } from "./Sampler";
import { load, Showcase, type ShowcaseProps } from "./Showcase";
import type { Format } from "./types";

// One composition per format, all from public/showcase.json: render the ones you want by id. Sampler shows
// every style side by side.
export const IDS: Record<Format, string> = { "16:9": "Showcase", "9:16": "Showcase-9x16", "1:1": "Showcase-1x1" };

export const Root = () => (
  <>
    {(Object.keys(IDS) as Format[]).map((format) => (
      <Composition
        key={format}
        id={IDS[format]}
        component={Showcase}
        calculateMetadata={load}
        defaultProps={{ storyboard: "showcase.json", format } as ShowcaseProps}
        width={FORMATS[format].width}
        height={FORMATS[format].height}
        fps={30}
        durationInFrames={300}
      />
    ))}
    <Composition id="Sampler" component={Sampler} calculateMetadata={loadSampler} defaultProps={{ storyboard: "showcase.json" }} width={1920} height={1080} fps={30} durationInFrames={300} />
  </>
);
