import type { ComponentType } from "react";
import type { Scene } from "../types";
import { Intro } from "./intro";
import { Outro } from "./outro";
import { Screen } from "./screen";
import { Stats } from "./stats";
import { Title } from "./title";

// What a scene's drawing gets: its storyboard entry (typed by each scene for its own kind), its take
// (screens only), and the chapter in force, the latest kicker at or before it.
export type SceneComponent = ComponentType<{ scene: never; take: never; chapter?: string }>;

// Every kind of scene. To add one, write scenes/<name>.tsx, add its shape to Scene in types.ts, and list
// it here and in SECONDS. A style can replace any of them (styles/index.ts).
export const SCENES: Record<Scene["type"], SceneComponent> = { intro: Intro, title: Title, screen: Screen, stats: Stats, outro: Outro };

// Default lengths; a screen lasts as long as its take.
export const SECONDS: Record<Exclude<Scene["type"], "screen">, number> = { intro: 3, title: 2, stats: 3.2, outro: 4 };
