import type { Format } from "./types";

// Each format's size and layout. type: how big its type runs against 16:9's. padX: the side margin for
// text. top and bottom: the safe areas, which a vertical feed's own buttons and captions cover. chipY: where
// the chapter chip sits. reframe: screens cut the take to a card around its action, which the camera follows,
// instead of showing the whole window. Add a format here and in Format (types.ts) and Root.tsx.
export type FormatSpec = {
  width: number;
  height: number;
  type: number;
  padX: number;
  top: number;
  bottom: number;
  chipY: number;
  reframe: boolean;
};

export const FORMATS: Record<Format, FormatSpec> = {
  "16:9": { width: 1920, height: 1080, type: 1, padX: 200, top: 48, bottom: 48, chipY: 28, reframe: false },
  "9:16": { width: 1080, height: 1920, type: 0.9, padX: 80, top: 170, bottom: 320, chipY: 96, reframe: true },
  "1:1": { width: 1080, height: 1080, type: 0.8, padX: 70, top: 96, bottom: 56, chipY: 28, reframe: true },
};
