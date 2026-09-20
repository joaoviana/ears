// Print one real listening report both ways — flat (v0) and ranked brief (the winning format) — from a muted
// engine, on the same seed and the same deliberate damage the benchmark uses. No Claude call.
import { Engine } from "../engine.ts";
import { Listener, compare, asText, metricDelta, type Profile } from "../report.ts";
import { makeBase } from "../seed.ts";
import { parseSlot, applyPatch } from "../patch.ts";
import { NoiseFloor, MIN_SAMPLES, type Differences, type Metric } from "../shots.ts";
import { brief as writeBrief, slotDrift } from "../brief.ts";
import { maskingLines } from "../masking.ts";

const SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6"], BANDS = ["sub", "low", "mid", "high", "air"] as const;
const METRICS_USED: Metric[] = ["sub", "low", "mid", "high", "air", "brightness", "loudness", "width"];
const e = new Engine(), wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let listener = new Listener(), taps: Record<string, any[]> = {}, barLen = 1846, barWaiters: (() => void)[] = [];
e.on("ears", (f) => listener.push(f)); e.on("onset", () => listener.onset());
e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f));
e.on("hit", (h: any) => listener.hit(h.offGrid ?? 0));
e.on("bar", ({ bpm }) => { barLen = (240 / bpm) * 1000; listener.bar(); barWaiters.splice(0).forEach((f) => f()); });
const nextBar = () => new Promise<void>((r) => barWaiters.push(r));

interface Tap { power: number; bands: number[]; centroid: number }
interface Win { master: Profile; taps: Record<string, Tap>; frames: { slot: string; bands: number[] }[] }
const windowOnce = async (): Promise<Win> => {
  await nextBar(); listener = new Listener(); taps = {}; for (let i = 0; i < 4; i++) await nextBar();
  const t: Record<string, Tap> = {};
  for (const k of SLOTS) { const f = taps[k] || [], n = Math.max(1, f.length), pw = f.map((x) => x.rms * x.rms), tot = pw.reduce((a, b) => a + b, 0); t[k] = { power: tot / n, bands: [0, 1, 2, 3, 4].map((i) => f.reduce((a, x) => a + x.bands[i] * x.bands[i], 0) / n), centroid: tot > 0 ? f.reduce((a, x, j) => a + x.centroid * pw[j], 0) / tot : 0 }; }
  return { master: listener.take()!, taps: t, frames: SLOTS.flatMap((k) => (taps[k] || []).map((x) => ({ slot: k, bands: x.bands }))) };
};
const window2 = async (): Promise<Win> => { for (let i = 0; i < 4; i++) { const w = await windowOnce(); if (w.master) return w; } throw new Error("no frames"); };
const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
const mix = (t: Record<string, Tap>) => { const tot = SLOTS.reduce((a, k) => a + t[k].power, 0), bands = [0, 1, 2, 3, 4].map((i) => SLOTS.reduce((a, k) => a + t[k].bands[i], 0)); return { loud: dB(tot), rel: bands.map((b) => dB(b) - dB(tot)), centroid: SLOTS.reduce((a, k) => a + t[k].centroid * t[k].power, 0) / Math.max(tot, 1e-12) }; };
const mixDiff = (a: Record<string, Tap>, b: Record<string, Tap>): Differences => { const x = mix(a), y = mix(b); return { envelope_db: y.loud - x.loud, centroid_hz: y.centroid - x.centroid, relative_bands_db: Object.fromEntries(BANDS.map((n, i) => [n, y.rel[i] - x.rel[i]])), onsets_per_beat: 0, peak_to_envelope_db: 0 } as any; };
const asMetrics = (d: any): Partial<Record<Metric, number>> => ({ ...d.relative_bands_db, brightness: d.centroid_hz, loudness: d.envelope_db, density: d.onsets_per_beat, punch: d.peak_to_envelope_db, width: d.width_db, groove: (d.off_grid_beats ?? 0) * 1000 } as any);
const scaleNumbers = (value: string, by: number, clamp = 20000) => value.replace(/\d+(\.\d+)?/g, (n) => String(Math.round(Math.min(clamp, Number(n) * by) * 100) / 100));
const breakIt = (slots: Record<string, string>) => { const out = { ...slots }, val = (code: string, key: string) => parseSlot(code).find((p) => p.key === key)?.value;
  out.d1 = out.d1.replace(/, 0\.9\)/, ", 0.3)");
  const hat = val(out.d2, "amp"); if (hat) out.d2 = applyPatch(out.d2, { slot: "d2", set: [{ key: "amp", value: scaleNumbers(hat, 2.6, 1) }] });
  const cut = val(out.d4, "cutoff"); out.d4 = applyPatch(out.d4, { slot: "d4", set: [{ key: "cutoff", value: cut ? scaleNumbers(cut, 3.2, 6000) : "3600" }] });
  return out; };

e.on("ready", async () => {
  const seed = Number(process.argv[2] || 41), base = makeBase(seed, "dark"), clean = base.slots;
  e.tempo(base.bpm); await wait(barLen * 1.2);
  for (const k of SLOTS) if (clean[k]) e.eval(clean[k], k);
  await nextBar(); await nextBar();
  const cal: Win[] = []; for (let i = 0; i <= MIN_SAMPLES; i++) cal.push(await window2());
  const target = cal[cal.length - 1], tapNoise: Record<string, NoiseFloor> = Object.fromEntries(SLOTS.map((k) => [k, new NoiseFloor()]));
  for (let i = 1; i < cal.length; i++) for (const k of SLOTS) tapNoise[k].sample(asMetrics(mixDiff(cal[i - 1].taps, { ...cal[i - 1].taps, [k]: cal[i].taps[k] })));
  const slots = breakIt(clean); for (const k of ["d1", "d2", "d4"]) e.eval(slots[k], k);
  await nextBar(); await wait(barLen * 0.5);
  const before = await window2();
  const lines = compare(before.master, target.master), drift = slotDrift(before.taps, target.taps);
  const worstSlot = drift[0]?.slot ?? "d1";
  console.log(`\n\u0001SEED ${seed} ${base.style} ${base.bpm} BPM\n`);
  console.log("\u0001FLAT-REPORT-START");
  console.log(asText(lines, "this track as it should sound"));
  console.log("\u0001FLAT-REPORT-END");
  console.log("\u0001BRIEF-START");
  console.log(writeBrief(lines, "this track as it should sound", drift, Object.fromEntries(METRICS_USED.map((m) => [m, tapNoise[worstSlot].floor(m)])), [{ metric: "air", slot: "d2", grade: "flat" }, { metric: "air", slot: "d2", grade: "flat" }], maskingLines(before.frames)));
  console.log("\u0001BRIEF-END");
  e.stop(); setTimeout(() => process.exit(0), 900);
});

e.start(true);
