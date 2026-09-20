// Which two voices are fighting?
//
// "The low end is muddy" is a symptom. The cause is almost always two voices in the same band at the same time:
// a kick and a bass both sitting at 60 Hz, a pad and a stab both filling 700 Hz. A master-bus report can never
// say this, because in the master they have already been added together. Per-slot taps can.
//
// For each pair of slots and each band we ask two questions: are they both substantially present in that band,
// and do they rise and fall together? Both together means they are competing for the same space at the same time.
// Level alone would flag a kick and a pad that never overlap; correlation alone would flag two quiet voices.
import { BANDS } from "./report.ts";

export interface BandFrame { slot: string; bands: number[] }
export interface Collision { a: string; b: string; band: string; overlap: number; share: number }

const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));

/** Pearson correlation of two series, 0 when either is flat. */
function correlate(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length); if (n < 8) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx > 1e-12 && dy > 1e-12 ? num / Math.sqrt(dx * dy) : 0;
}

/**
 * Pairs of voices competing for the same band, worst first.
 * @param frames  per-slot band energies over a window, in the order they were measured
 * @param floorDb how far below the loudest voice in a band still counts as present (default 12 dB)
 */
export function collisions(frames: BandFrame[], floorDb = 12): Collision[] {
  const slots = [...new Set(frames.map((f) => f.slot))];
  if (slots.length < 2) return [];
  const series: Record<string, number[][]> = {};
  for (const s of slots) series[s] = BANDS.map((_, i) => frames.filter((f) => f.slot === s).map((f) => (f.bands[i] ?? 0) ** 2));
  const total = (s: string, i: number) => series[s][i].reduce((a, b) => a + b, 0);

  const out: Collision[] = [];
  BANDS.forEach((band, i) => {
    const loudest = Math.max(...slots.map((s) => total(s, i)));
    if (loudest <= 1e-10) return;
    const present = slots.filter((s) => dB(total(s, i)) > dB(loudest) - floorDb);
    for (let a = 0; a < present.length; a++) for (let b = a + 1; b < present.length; b++) {
      const r = correlate(series[present[a]][i], series[present[b]][i]);
      if (r < 0.3) continue;                                    // they are both here, but not at the same moments
      const pair = total(present[a], i) + total(present[b], i), all = slots.reduce((acc, s) => acc + total(s, i), 0);
      // overlap: how much they coincide, weighted by how much of the band they jointly own
      out.push({ a: present[a], b: present[b], band, overlap: r, share: all > 0 ? pair / all : 0 });
    }
  });
  return out.filter((c) => c.share > 0.45).sort((x, y) => y.overlap * y.share - x.overlap * x.share);
}

/** The lines the agent reads. Empty when nothing is fighting, which is the common case and worth saying nothing about. */
export function maskingLines(frames: BandFrame[]): string[] {
  return collisions(frames).slice(0, 3).map((c) => `  ${c.a} and ${c.b} are both filling ${c.band} at the same moments (${Math.round(c.overlap * 100)}% together, ${Math.round(c.share * 100)}% of that band). Move one of them out, or duck one under the other.`);
}
