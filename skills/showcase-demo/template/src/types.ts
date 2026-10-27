import type { Take } from "./motion";

export type { Take };
export type Format = "16:9" | "9:16" | "1:1";
export type Enter = "fade" | "slide" | "iris" | "clock" | "push" | "blocks";

export type Brand = {
  name: string;
  tagline?: string;
  url?: string; // shown in the window's address bar and, by default, as the outro's call to action
  logo?: string; // a file in public/
  // stage: behind the take in screen scenes (default: accent); paper or ink when the app is itself the accent
  colors: { paper: string; ink: string; accent: string; muted: string; stage?: string };
  shadow?: "soft" | "hard"; // the window's shadow: soft and deep, or a hard offset in ink
};

// What any scene can carry: how it arrives over the last one, the formats that include it (default: all),
// and a chapter kicker ("02 · Sources"), which the chip carries through the screens after it.
type Common = { enter?: Enter; only?: Format[]; kicker?: string };
export type Scene = Common &
  (
    | { type: "intro"; seconds?: number }
    | { type: "title"; text: string; theme?: "light" | "dark" | "accent"; seconds?: number }
    | { type: "screen"; take: string; title?: string; frame?: string; from?: number; to?: number }
    | { type: "stats"; items: { value: string; label: string }[]; seconds?: number }
    | { type: "outro"; text?: string; cta?: string; seconds?: number }
  );

// public/showcase.json
export type Board = {
  brand: Brand;
  scenes: Scene[];
  style?: string; // a style in styles/index.ts (default "clean")
  music?: string; // a file in public/
  fps?: number;
  chip?: boolean; // the chapter chip on screens and stats (default true)
};
