// When each scene starts, as pure functions of the scenes' lengths, so test.sh can run this file with plain
// Node. Neighbouring scenes overlap by `overlap` frames, the length of the transition between them.

/** The frame each scene starts at. */
export const startsOf = (lengths: number[], overlap: number) => lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b - overlap, 0));

/** Scene lengths in frames with the cuts on the music's beat: each flexible scene (a title, stats, a quote:
 *  anything that isn't a take) is stretched or shortened by up to half a beat, so the cut after it lands on
 *  one. A take's length is its own, and the flexible scene after it absorbs the difference. Each scene keeps
 *  at least `least` frames. */
export function onBeat(lengths: number[], flexible: boolean[], overlap: number, fps: number, beat: { bpm: number; offset?: number }, least = 2 * overlap): number[] {
  const period = (60 * fps) / beat.bpm;
  const first = (beat.offset ?? 0) * fps;
  const out = [...lengths];
  let start = 0;
  for (let i = 0; i < out.length; i++) {
    if (flexible[i] && i < out.length - 1) {
      const cut = start + out[i] - overlap; // where the next scene starts
      let k = Math.round((cut - first) / period);
      while (Math.round(first + k * period) - start + overlap < least) k++;
      out[i] = Math.round(first + k * period) - start + overlap;
    }
    start += out[i] - overlap;
  }
  return out;
}
