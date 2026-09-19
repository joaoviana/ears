// Called shots. A DJ's idea must say what it expects to happen to the sound ("EXPECT brightness down"). When the
// evidence layer produces a before/after comparison for that change, the host grades the call. The grade is shown,
// kept per DJ, and fed into that DJ's next prompt, so a DJ that keeps being wrong is told so, in numbers.
// Pure module: no UI, no engine. Grading is observational (live master mix), and says so.
export const METRICS = ["sub", "low", "mid", "high", "air", "brightness", "loudness", "density", "punch"] as const;
export type Metric = (typeof METRICS)[number];
export type Dir = "up" | "down" | "same";
export interface Expect { metric: Metric; dir: Dir }
export type Grade = "hit" | "miss" | "flat" | "ungraded";
export interface Outcome { grade: Grade; delta: number | null; unit: string; floor: number; text: string }
export interface Differences { envelope_db: number; peak_to_envelope_db: number; centroid_hz: number; onsets_per_beat: number; relative_bands_db: Record<string, number> }

const UNIT: Record<Metric, string> = { sub: "dB", low: "dB", mid: "dB", high: "dB", air: "dB", brightness: "Hz", loudness: "dB", density: "/beat", punch: "dB" };
// the smallest change worth calling a change, before any noise has been measured
const BASE: Record<Metric, number> = { sub: 1.2, low: 1.2, mid: 1.2, high: 1.5, air: 2, brightness: 220, loudness: 0.8, density: 0.3, punch: 1.2 };
export const ARROW: Record<Dir, string> = { up: "↑", down: "↓", same: "=" };

export function parseExpect(line: string): Expect | null {
  const m = line.match(/^\s*EXPECT\s*:?\s*([a-z]+)\s+(up|down|same|higher|lower|more|less|unchanged)\b/i); if (!m) return null;
  const alias: Record<string, Metric> = { centroid: "brightness", bright: "brightness", envelope: "loudness", level: "loudness", onsets: "density", busy: "density", crest: "punch", bass: "low", treble: "high", highs: "high", subs: "sub" };
  const metric = (alias[m[1].toLowerCase()] ?? m[1].toLowerCase()) as Metric; if (!METRICS.includes(metric)) return null;
  const d = m[2].toLowerCase(), dir: Dir = d === "up" || d === "higher" || d === "more" ? "up" : d === "down" || d === "lower" || d === "less" ? "down" : "same";
  return { metric, dir };
}
export const describeExpect = (e: Expect) => `${e.metric} ${ARROW[e.dir]}`;
export const pick = (d: Differences, m: Metric): number => m === "brightness" ? d.centroid_hz : m === "loudness" ? d.envelope_db : m === "density" ? d.onsets_per_beat : m === "punch" ? d.peak_to_envelope_db : d.relative_bands_db[m] ?? 0;

/**
 * How much the sound moves between two windows when NOTHING was changed: patterns here are stochastic, so some
 * movement is just the music. A call only counts as a hit if it clears twice that.
 */
export class NoiseFloor {
  private last: { key: string; d: Record<Metric, number> } | null = null;
  private samples: Record<Metric, number[]> = Object.fromEntries(METRICS.map((m) => [m, []])) as any;
  /** feed every stable observation: `key` identifies the state it was measured under */
  push(key: string, absolute: Record<Metric, number>) {
    if (this.last && this.last.key === key) for (const m of METRICS) { const s = this.samples[m]; s.push(Math.abs(absolute[m] - this.last.d[m])); if (s.length > 24) s.shift(); }
    this.last = { key, d: absolute };
  }
  /** feed a measured difference directly (e.g. a counterfactual diff between two windows of unchanged music) */
  sample(diff: Partial<Record<Metric, number>>) { for (const m of METRICS) if (diff[m] != null) { const s = this.samples[m]; s.push(Math.abs(diff[m]!)); if (s.length > 24) s.shift(); } }
  floor(m: Metric): number {
    const s = this.samples[m]; if (s.length < 3) return BASE[m];
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.max(BASE[m], mean * 2);
  }
}

export function grade(e: Expect, d: Differences | null, floor: number): Outcome {
  const unit = UNIT[e.metric];
  if (!d) return { grade: "ungraded", delta: null, unit, floor, text: "no clean before/after window" };
  const delta = pick(d, e.metric), moved = Math.abs(delta) >= floor, up = delta > 0;
  const shown = `${delta >= 0 ? "+" : ""}${e.metric === "brightness" ? Math.round(delta) : delta.toFixed(1)} ${unit}`;
  if (e.dir === "same") return { grade: moved ? "miss" : "hit", delta, unit, floor, text: moved ? `${shown}: it moved` : `${shown}: held` };
  if (!moved) return { grade: "flat", delta, unit, floor, text: `${shown}: inside the noise (±${e.metric === "brightness" ? Math.round(floor) : floor.toFixed(1)})` };
  return { grade: up === (e.dir === "up") ? "hit" : "miss", delta, unit, floor, text: shown };
}

export interface Tally { hit: number; miss: number; flat: number; ungraded: number }
export const emptyTally = (): Tally => ({ hit: 0, miss: 0, flat: 0, ungraded: 0 });
/** one line for the next prompt */
export const forPrompt = (e: Expect, o: Outcome) => `you called ${e.metric} ${e.dir}; measured ${o.text} → ${o.grade.toUpperCase()}${o.grade === "miss" ? " (you were wrong: say what you misjudged, and correct for it)" : o.grade === "flat" ? " (no detectable effect: be bolder or pick a metric your change really moves)" : ""}`;
