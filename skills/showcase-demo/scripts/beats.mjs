#!/usr/bin/env node
/**
 * beats.mjs <audio> — the music's tempo and where its first beat falls, for "beat" in showcase.json:
 *
 *   node beats.mjs public/music/score.wav     →     {"bpm":120,"offset":0.48}
 *
 * ffmpeg decodes it to mono; onsets are the rises in loudness every 256 samples; the tempo is the period
 * (70 to 180 BPM, leaning towards 120) at which the onsets best repeat, and the offset is where a grid of
 * that period lines up with them best. Check it by ear: a wrong guess is usually half or double the tempo.
 */
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) {
  console.error("usage: node beats.mjs <audio>");
  process.exit(2);
}
const RATE = 11025;
const HOP = 256;
const HPS = RATE / HOP; // hops a second
const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const x = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));
const loud = [];
for (let i = 0; i + HOP <= x.length; i += HOP) {
  let e = 0;
  for (let j = i; j < i + HOP; j++) e += x[j] * x[j];
  loud.push(Math.log1p(1000 * e));
}
const onset = loud.map((v, i) => Math.max(0, v - (loud[i - 1] ?? v)));
const at = (i) => {
  const a = Math.floor(i);
  return (onset[a] ?? 0) * (a + 1 - i) + (onset[a + 1] ?? 0) * (i - a);
};
// how strongly the onsets land on a grid of `period` hops that starts at `phase`
const fit = (period, phase) => {
  let [sum, n] = [0, 0];
  for (let i = phase; i < onset.length; i += period) [sum, n] = [sum + at(i), n + 1];
  return sum / Math.max(1, n);
};
let best = { score: -Infinity, bpm: 0, phase: 0 };
for (let bpm = 70; bpm <= 180; bpm += 0.25) {
  const period = (60 / bpm) * HPS;
  const lean = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
  for (let phase = 0; phase < period; phase += 0.25) {
    const score = fit(period, phase) * lean;
    if (score > best.score) best = { score, bpm, phase };
  }
}
console.log(JSON.stringify({ bpm: best.bpm, offset: Math.round((best.phase / HPS) * 1000) / 1000 }));
