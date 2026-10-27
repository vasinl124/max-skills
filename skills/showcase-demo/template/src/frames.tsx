import type { ReactNode } from "react";
import { mono } from "./fonts";
import { useShowcase, useSurface } from "./parts";
import type { Surface } from "./styles";
import type { Brand } from "./types";

// How a take is presented in 16:9 (reframed formats crop it into a card instead). bar: the chrome's height
// above the take, in px. A scene picks one with `frame` (default browser): browser, card, phone (for a take
// recorded at a phone's size) or terminal (for a command line in the browser). Add a frame: write its Chrome
// and list it in FRAMES.
export type Frame = { bar: number; Chrome: (props: { width: number; children: ReactNode }) => ReactNode };

// A window's shadow and border on the stage's surface s: a hard offset in its edge colour, or a soft drop
// shadow, lit by the surface's glow when it has one.
export const shadowOf = (brand: Brand, s: Surface) =>
  brand.shadow === "hard"
    ? `12px 12px 0 ${s.edge}`
    : `${s.glow ? `0 0 140px -30px ${s.glow}, ` : ""}0 60px 120px -40px rgba(0,0,0,0.45), 0 24px 48px -24px rgba(0,0,0,0.25)`;
export const borderOf = (brand: Brand, s: Surface) => `1px solid ${brand.shadow === "hard" ? s.edge : `color-mix(in oklab, ${s.text} 12%, transparent)`}`;

function Browser({ width, children }: { width: number; children: ReactNode }) {
  const { brand } = useShowcase();
  const s = useSurface("stage");
  const { muted } = brand.colors;
  return (
    <div style={{ width, borderRadius: 16, overflow: "hidden", background: "#fff", border: borderOf(brand, s), boxShadow: shadowOf(brand, s) }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "#f5f5f3", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        {brand.url && (
          <div style={{ margin: "0 auto", transform: "translateX(-32px)", display: "flex", alignItems: "center", gap: 9, padding: "6px 24px", borderRadius: 8, background: "rgba(0,0,0,0.05)", color: muted, fontSize: 16 }}>
            <svg width="11" height="14" viewBox="0 0 11 14">
              <rect x="0.5" y="6" width="10" height="7.5" rx="1.6" fill={muted} />
              <path d="M2.8 6V4.2a2.7 2.7 0 0 1 5.4 0V6" stroke={muted} strokeWidth="1.6" fill="none" />
            </svg>
            {brand.url}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Card({ width, children }: { width: number; children: ReactNode }) {
  const { brand } = useShowcase();
  const s = useSurface("stage");
  return <div style={{ width, borderRadius: 20, overflow: "hidden", background: "#fff", border: borderOf(brand, s), boxShadow: shadowOf(brand, s) }}>{children}</div>;
}

// a phone: a black bezel drawn outside the screen, rounded screen corners, and the camera's pill over the top
function Phone({ width, children }: { width: number; children: ReactNode }) {
  const { brand } = useShowcase();
  const s = useSurface("stage");
  const bezel = Math.max(10, Math.round(width * 0.035));
  return (
    <div style={{ width, position: "relative", overflow: "hidden", borderRadius: width * 0.13, background: "#000", boxShadow: `0 0 0 ${bezel}px #101012, 0 0 0 ${bezel + 2}px #38383c, ${shadowOf(brand, s)}` }}>
      {children}
      <div style={{ position: "absolute", top: width * 0.028, left: "50%", width: width * 0.3, height: width * 0.085, marginLeft: -width * 0.15, borderRadius: 999, background: "#101012" }} />
    </div>
  );
}

// a terminal window: a dark title bar with the traffic lights and the shell's name
function Terminal({ width, children }: { width: number; children: ReactNode }) {
  const { brand } = useShowcase();
  const s = useSurface("stage");
  return (
    <div style={{ width, borderRadius: 12, overflow: "hidden", background: "#0f0f12", border: "1px solid #2b2b31", boxShadow: shadowOf(brand, s) }}>
      <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", background: "#1b1b20", borderBottom: "1px solid #2b2b31" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
        ))}
        <div style={{ margin: "0 auto", transform: "translateX(-30px)", fontFamily: mono, fontSize: 14, color: "#8d8d96" }}>{brand.name.toLowerCase()} — zsh</div>
      </div>
      {children}
    </div>
  );
}

export const FRAMES: Record<string, Frame> = {
  browser: { bar: 44, Chrome: Browser },
  card: { bar: 0, Chrome: Card },
  phone: { bar: 0, Chrome: Phone },
  terminal: { bar: 36, Chrome: Terminal },
};
