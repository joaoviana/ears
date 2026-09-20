// Turns the ears stream into the thing the agent (and the room) reads: a few numbers against a
// reference, with one plain word per line. This text is the agent's entire sense of hearing.
import type { Ears } from "./engine.ts";

export const BANDS = ["sub", "low", "mid", "high", "air"] as const;
// rms/crest remain internal aliases so existing reference files keep their calibration.
export interface Capture { start_ms: number; end_ms: number; frames: number; dropped_frames: number; state_revisions: string[]; active_revisions: number[] }
export interface Profile { rms: number; crest: number; centroid: number; onsetsPerBeat: number; bands: number[];
  /** stereo width: side over mid, in dB. -inf is mono, 0 is as much difference as sum. */
  width: number;
  /** how close the master came to clipping, in dB below full scale. 0 is clipping. */
  headroom: number;
  /** how far hits land from the 16th grid, mean absolute, in beats. 0 is machine-tight. */
  offGrid: number;
  capture?: Capture }
export function audioMetrics(p: Profile) {
  return { envelope_dbfs: p.rms, peak_to_envelope_db: p.crest, centroid_hz: p.centroid, onsets_per_beat: p.onsetsPerBeat, width_db: p.width, headroom_db: p.headroom, off_grid_beats: p.offGrid, bands_dbfs: Object.fromEntries(BANDS.map((b, i) => [b, p.bands[i]])) };
}
export function metricDelta(before: Profile, after: Profile) {
  return { width_db: after.width - before.width, off_grid_beats: after.offGrid - before.offGrid, headroom_db: after.headroom - before.headroom, envelope_db: after.rms - before.rms, peak_to_envelope_db: after.crest - before.crest, centroid_hz: after.centroid - before.centroid, onsets_per_beat: after.onsetsPerBeat - before.onsetsPerBeat, relative_bands_db: Object.fromEntries(BANDS.map((b, i) => [b, (after.bands[i] - after.rms) - (before.bands[i] - before.rms)])) };
}
export interface Line { label: string; value: string; delta: number | null; word: string }

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-6));

export class Listener {
  private frames: Ears[] = [];
  private contexts: { at: number; revision?: string; active_revision?: number }[] = [];
  private dropped = 0;
  private onsets = 0;
  private offGridSum = 0;
  private hits = 0;
  private beats = 0;
  push(e: Ears, context: { revision?: string; active_revision?: number; at?: number } = {}) {
    if (![e.peak, e.rms, e.centroid, ...e.bands].every(Number.isFinite) || e.bands.length !== 5 || e.peak > 8 || e.peak < 0 || e.rms < 0) { this.dropped++; return; }
    this.frames.push(e); this.contexts.push({ at: context.at ?? Date.now(), revision: context.revision, active_revision: context.active_revision });
    if (this.frames.length > 600) { this.frames.shift(); this.contexts.shift(); this.dropped++; }
  }
  onset() { this.onsets++; }
  /** every scheduled hit's distance from the 16th grid, so the report can say whether the set swings */
  hit(offGrid: number) { this.offGridSum += Math.abs(offGrid); this.hits++; }
  bar() { this.beats += 4; }

  /** Summarise everything heard since the last call. */
  take(): Profile | null {
    const f = this.frames;
    if (f.length < 10 || this.beats === 0) return null;
    const mean = (g: (e: Ears) => number) => f.reduce((s, e) => s + g(e), 0) / f.length;
    const rms = mean((e) => e.rms);
    const p: Profile = {
      rms: db(rms),
      crest: db(Math.max(...f.map((e) => e.peak)) / Math.max(rms, 1e-6)),
      centroid: mean((e) => e.centroid),
      onsetsPerBeat: this.onsets / this.beats,
      bands: BANDS.map((_, i) => db(mean((e) => e.bands[i]))),
      width: db(mean((e) => e.side ?? 0)) - db(rms),
      headroom: -db(Math.max(...f.map((e) => e.headroomPeak ?? 0), 1e-6)),
      offGrid: this.hits ? this.offGridSum / this.hits : 0,
      capture: { start_ms: this.contexts[0].at, end_ms: this.contexts.at(-1)!.at, frames: f.length, dropped_frames: this.dropped,
        state_revisions: [...new Set(this.contexts.flatMap(c => c.revision ? [c.revision] : []))], active_revisions: [...new Set(this.contexts.flatMap(c => c.active_revision == null ? [] : [c.active_revision]))] },
    };
    this.frames = []; this.contexts = []; this.dropped = 0; this.onsets = 0; this.beats = 0; this.offGridSum = 0; this.hits = 0;
    return p;
  }
}

export function compare(now: Profile, ref: Profile | null): Line[] {
  const lines: Line[] = [];
  const word = (d: number, lo: string, hi: string, tol = 3) => (d < -tol ? lo : d > tol ? hi : "ok");
  const names: [string, string, string][] = [["sub  <80Hz", "thin", "boomy"], ["low  150Hz", "hollow", "muddy"], ["mid  700Hz", "scooped", "boxy"], ["high 3kHz", "dull", "harsh"], ["air  >7kHz", "closed", "fizzy"]];
  names.forEach(([label, lo, hi], i) => {
    // band balance is judged relative to overall level, so turning the whole mix up isn't "boomy"
    const rel = now.bands[i] - now.rms;
    const d = ref ? rel - (ref.bands[i] - ref.rms) : null;
    lines.push({ label, value: `${rel >= 0 ? "+" : ""}${rel.toFixed(1)} dB`, delta: d, word: d === null ? "" : word(d, lo, hi) });
  });
  const c = ref ? (now.centroid / Math.max(ref.centroid, 1e-6) - 1) * 100 : null;
  lines.push({ label: "centroid", value: `${(now.centroid / 1000).toFixed(1)} kHz`, delta: c, word: c === null ? "" : c > 25 ? "bright" : c < -25 ? "dark" : "ok" });
  const o = ref ? now.onsetsPerBeat - ref.onsetsPerBeat : null;
  lines.push({ label: "onsets/beat", value: now.onsetsPerBeat.toFixed(1), delta: o, word: o === null ? "" : o < -0.8 ? "sparse" : o > 0.8 ? "busy" : "ok" });
  const l = ref ? now.rms - ref.rms : null;
  lines.push({ label: "envelope", value: `${now.rms.toFixed(1)} dB`, delta: l, word: l === null ? "" : word(l, "quiet", "hot", 2.5) });
  lines.push({ label: "peak/env", value: `${now.crest.toFixed(1)} dB`, delta: ref ? now.crest - ref.crest : null, word: ref ? word(now.crest - ref.crest, "squashed", "spiky", 3) : "" });
  const num = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const rw = ref ? num(ref.width) : null, w = rw === null ? null : now.width - rw;
  lines.push({ label: "width", value: `${now.width.toFixed(1)} dB`, delta: w, word: w === null ? "" : word(w, "narrow", "wide", 3) });
  const rg = ref ? num(ref.offGrid) : null, t = rg === null ? null : now.offGrid - rg;
  lines.push({ label: "groove", value: `${(now.offGrid * 1000).toFixed(0)} ms off`, delta: t === null ? null : t * 1000, word: t === null ? "" : Math.abs(t) < 0.004 ? "ok" : t > 0 ? "loose" : "stiff" });   // delta in ms, like the value
  // headroom is absolute, not a comparison: under 1 dB is about to clip whatever the reference did
  // measured before the limiter, so this is how hard the limiter is having to work, not the output ceiling
  lines.push({ label: "headroom", value: `${now.headroom.toFixed(1)} dB`, delta: null, word: now.headroom < -3 ? "slamming the limiter" : now.headroom < 0 ? "limiting" : "ok" });
  return lines;
}

export const asText = (lines: Line[], refName: string) =>
  [`vs reference "${refName}"`, ...lines.map((l) => `${l.label.padEnd(12)} ${l.value.padStart(9)}  ${l.delta === null ? "" : (l.delta >= 0 ? "+" : "") + l.delta.toFixed(1) + (l.label === "centroid" ? "%" : "")}  ${l.word}`)].join("\n");
