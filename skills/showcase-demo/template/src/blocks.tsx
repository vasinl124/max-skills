import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { clamp } from "./motion";

// The next scene drops in as a row of eight blocks, left to right, each a beat after the one before; the
// last starts halfway through. The drafting style's way in, and any scene's with "enter": "blocks".
const N = 8;
const LAG = 0.5;

function Blocks({ children, presentationProgress: p, presentationDirection }: TransitionPresentationComponentProps<Record<string, never>>) {
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  // the bottom edge of each block, as a staircase under the frame's top edge
  const drop = (i: number) => clamp((p - (LAG * i) / (N - 1)) / (1 - LAG)) * 100;
  const steps = Array.from({ length: N }, (_, i) => `${(i * 100) / N}% ${drop(i)}%, ${((i + 1) * 100) / N}% ${drop(i)}%`);
  return <AbsoluteFill style={{ clipPath: `polygon(0% 0%, ${steps.join(", ")}, 100% 0%)` }}>{children}</AbsoluteFill>;
}

export const blocks = (): TransitionPresentation<Record<string, never>> => ({ component: Blocks, props: {} });
