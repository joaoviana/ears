// The live host's per-slot hearing. Each slot has its own analyser in the engine; this keeps a short history of
// what each one measured, so a call about the hats can be judged on the hats instead of on a master mix where the
// kick and bass drown them. Same approximation as the benchmark's: other slots are held at their "before"
// measurement, so this is a dry-slot contribution estimate, not a controlled re-render.
import type { Differences } from "./shots.ts";
const BANDS = ["sub", "low", "mid", "high", "air"] as const;

export interface SlotFrame { slot: string; rms: number; centroid: number; bands: number[] }
export interface SlotWindow { power: number; bands: number[]; centroid: number; frames: number }
const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));

export class SlotEars {
  private frames = new Map<string, { at: number; f: SlotFrame }[]>();
  constructor(private keep = 40000) {}
  push(f: SlotFrame) { const xs = this.frames.get(f.slot) ?? []; xs.push({ at: Date.now(), f }); const cut = Date.now() - this.keep; while (xs.length && xs[0].at < cut) xs.shift(); this.frames.set(f.slot, xs); }
  /** the average of one slot's frames inside a window; null if it was not heard from */
  window(slot: string, from: number, to: number): SlotWindow | null {
    const xs = (this.frames.get(slot) ?? []).filter((x) => x.at >= from && x.at <= to);
    if (xs.length < 3) return null;
    const pw = xs.map((x) => x.f.rms * x.f.rms), tot = pw.reduce((a, b) => a + b, 0);
    return { power: tot / xs.length, bands: [0, 1, 2, 3, 4].map((i) => xs.reduce((a, x) => a + x.f.bands[i] * x.f.bands[i], 0) / xs.length), centroid: tot > 0 ? xs.reduce((a, x, j) => a + x.f.centroid * pw[j], 0) / tot : 0, frames: xs.length };
  }
  /** the raw per-slot band frames in a window, for masking: it needs the movement, not the average */
  bandFrames(from: number, to: number) { return [...this.frames.values()].flat().filter((x) => x.at >= from && x.at <= to).map((x) => ({ slot: x.f.slot, bands: x.f.bands })); }
  all(from: number, to: number): Record<string, SlotWindow> { const out: Record<string, SlotWindow> = {}; for (const slot of this.frames.keys()) { const w = this.window(slot, from, to); if (w) out[slot] = w; } return out; }
}

const mix = (t: Record<string, SlotWindow>) => { const ks = Object.keys(t), tot = ks.reduce((a, k) => a + t[k].power, 0), bands = [0, 1, 2, 3, 4].map((i) => ks.reduce((a, k) => a + t[k].bands[i], 0)); return { loud: dB(tot), rel: bands.map((b) => dB(b) - dB(tot)), centroid: ks.reduce((a, k) => a + t[k].centroid * t[k].power, 0) / Math.max(tot, 1e-12) }; };

/**
 * What changed in the dry mix when ONLY `slot` moved from its before-measurement to its after-measurement.
 * Returns null unless both windows heard that slot and every other slot that was playing.
 * `density` and `punch` have no per-slot measurement; the caller supplies them from the master delta.
 */
export function slotDifference(before: Record<string, SlotWindow>, after: Record<string, SlotWindow>, slot: string, master: Pick<Differences, "onsets_per_beat" | "peak_to_envelope_db">): Differences | null {
  if (!before[slot] || !after[slot]) return null;
  const keys = Object.keys(before);
  if (!keys.length) return null;
  const a = mix(before), b = mix({ ...before, [slot]: after[slot] });
  return { envelope_db: b.loud - a.loud, centroid_hz: b.centroid - a.centroid, relative_bands_db: Object.fromEntries(BANDS.map((n, i) => [n, b.rel[i] - a.rel[i]])) as Record<string, number>, onsets_per_beat: master.onsets_per_beat, peak_to_envelope_db: master.peak_to_envelope_db };
}
export const PER_SLOT_METRICS = new Set(["sub", "low", "mid", "high", "air", "brightness", "loudness"]);
