// Does the protocol help? Headless, on a second muted engine. Same seeds, same DJ, three conditions:
//   A blind       the DJ sees the code only
//   B ears        code + listening report (the v0 protocol)
//   C ears+shots  B, plus its own graded record fed back into the next prompt
// Self-referenced steering: each base is measured clean (that is the target), then deliberately broken (kick
// buried, hats too loud, bass filter wide open). The question is whether the DJ steers it back, and how fast.
// Called shots are graded two ways: on the MASTER mix (what the live host does today) and from the PER-SLOT TAPS,
// as the change attributable to the edited slot alone: the dry mix is rebuilt with every other slot held at its
// "before" measurement, so other voices' randomness can't mask or fake an effect.
//   npm run ears:bench -- [seeds=2] [rounds=6]
import fs from "fs"; import path from "path";
import { Engine, ROOT } from "../engine.ts"; import { Listener, compare, asText, metricDelta, type Profile } from "../report.ts";
import { ask, type Past, type Suggestion } from "../agent.ts"; import { roster } from "../djs.ts"; import { makeBase } from "../seed.ts";
import { parseSlot, applyPatch } from "../patch.ts";
import { NoiseFloor, grade, forPrompt, type Differences, type Metric } from "../shots.ts";
process.env.EARS_ANGLES = "1";
const N_SEEDS = Number(process.argv[2] || 2), ROUNDS = Number(process.argv[3] || 6), SEEDS = [41, 7, 77, 12, 33, 5, 21, 64].slice(0, N_SEEDS);
const CONDS = ["blind", "ears", "ears+shots"] as const, SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6"], BANDS = ["sub", "low", "mid", "high", "air"] as const;
const dj = roster().find((d) => d.id === "resident")!, e = new Engine(), wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let listener = new Listener(), taps: Record<string, { rms: number; centroid: number; bands: number[] }[]> = {}, barLen = 1846, barWaiters: (() => void)[] = [];
e.on("ears", (f) => listener.push(f)); e.on("onset", () => listener.onset()); e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f));
e.on("bar", ({ bpm }) => { barLen = (240 / bpm) * 1000; listener.bar(); barWaiters.splice(0).forEach((f) => f()); });
e.on("log", (l) => /ERROR/.test(l) && console.log("   [sc]", l.slice(0, 100)));
const nextBar = () => new Promise<void>((r) => barWaiters.push(r));

interface Tap { power: number; bands: number[]; centroid: number }
interface Win { master: Profile; taps: Record<string, Tap> }
const window2 = async (): Promise<Win> => {
  await nextBar(); listener = new Listener(); taps = {}; for (let i = 0; i < 4; i++) await nextBar();   // four bars: the grooves turn around every fourth bar, and the hats are random
  const t: Record<string, Tap> = {};
  for (const k of SLOTS) { const f = taps[k] || [], n = Math.max(1, f.length), pw = f.map((x) => x.rms * x.rms), tot = pw.reduce((a, b) => a + b, 0); t[k] = { power: tot / n, bands: [0, 1, 2, 3, 4].map((i) => f.reduce((a, x) => a + x.bands[i] * x.bands[i], 0) / n), centroid: tot > 0 ? f.reduce((a, x, j) => a + x.centroid * pw[j], 0) / tot : 0 }; }
  return { master: listener.take()!, taps: t };
};
const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
/** the dry mix rebuilt from the taps: total level, band balance, brightness */
const mix = (t: Record<string, Tap>) => { const tot = SLOTS.reduce((a, k) => a + t[k].power, 0), bands = [0, 1, 2, 3, 4].map((i) => SLOTS.reduce((a, k) => a + t[k].bands[i], 0)); return { loud: dB(tot), rel: bands.map((b) => dB(b) - dB(tot)), centroid: SLOTS.reduce((a, k) => a + t[k].centroid * t[k].power, 0) / Math.max(tot, 1e-12) }; };
const mixDiff = (a: Record<string, Tap>, b: Record<string, Tap>, master?: [Profile, Profile]): Differences => { const x = mix(a), y = mix(b), m = master ? metricDelta(master[0], master[1]) as any : { onsets_per_beat: 0, peak_to_envelope_db: 0 }; return { envelope_db: y.loud - x.loud, centroid_hz: y.centroid - x.centroid, relative_bands_db: Object.fromEntries(BANDS.map((n, i) => [n, y.rel[i] - x.rel[i]])), onsets_per_beat: m.onsets_per_beat, peak_to_envelope_db: m.peak_to_envelope_db }; };
const asMetrics = (d: Differences): Partial<Record<Metric, number>> => ({ ...d.relative_bands_db, brightness: d.centroid_hz, loudness: d.envelope_db, density: d.onsets_per_beat, punch: d.peak_to_envelope_db } as any);
/** how far the dry mix is from the clean base, in tolerances (1.5 dB per band, 0.15 octave of brightness, 1 dB level), each capped at 4 */
const distance = (t: Record<string, Tap>, target: Record<string, Tap>) => { const a = mix(t), b = mix(target), cap = (x: number) => Math.min(4, x); return ([...a.rel.map((v, i) => cap(Math.abs(v - b.rel[i]) / 1.5)), cap(Math.abs(Math.log2(a.centroid / b.centroid)) / 0.15), cap(Math.abs(a.loud - b.loud) / 1)]).reduce((x, y) => x + y, 0) / 7; };
/** deliberately worse: the kick buried, the hats too loud, the low voice's filter wide open */
const breakIt = (slots: Record<string, string>) => { const out = { ...slots }, val = (code: string, key: string) => parseSlot(code).find((p) => p.key === key)?.value;
  out.d1 = out.d1.replace(/, 0\.9\)/, ", 0.3)");
  const hat = val(out.d2, "amp"); if (hat) out.d2 = applyPatch(out.d2, { slot: "d2", set: [{ key: "amp", value: `(${hat}) * 2.6` }] });
  const cut = val(out.d4, "cutoff"); out.d4 = applyPatch(out.d4, { slot: "d4", set: [{ key: "cutoff", value: cut ? `(${cut}) * 3.2` : "3600" }] });
  return out; };

interface Row { cond: string; seed: number; round: number; ms: number | null; refused: number; slot: string; call: string; master: string; tap: string; tapDelta: number | null; dist_before: number; dist_after: number; why: string }
const rows: Row[] = [], noiseOfDistance: number[] = [];

e.on("ready", async () => {
  for (const cond of CONDS) for (const seed of SEEDS) {
    const base = makeBase(seed), clean = base.slots;
    e.eval("Pdef.all.do(_.stop); 1", "stop"); e.tempo(base.bpm); await wait(barLen * 1.2);
    for (const k of SLOTS) if (clean[k]) e.eval(clean[k], k);
    await nextBar(); await nextBar();
    const w1 = await window2(), w2 = await window2(), w3 = await window2();                       // the clean base: target + noise floor
    const target = w3, masterNoise = new NoiseFloor(), tapNoise: Record<string, NoiseFloor> = Object.fromEntries(SLOTS.map((k) => [k, new NoiseFloor()]));
    for (const [a, b] of [[w1, w2], [w2, w3]] as const) { masterNoise.sample(asMetrics(metricDelta(a.master, b.master) as any)); for (const k of SLOTS) tapNoise[k].sample(asMetrics(mixDiff(a.taps, { ...a.taps, [k]: b.taps[k] }))); }
    const slots = breakIt(clean); for (const k of ["d1", "d2", "d4"]) e.eval(slots[k], k);
    await nextBar(); await wait(barLen * 0.5);
    let before = await window2(); const history: Past[] = [];
    const selfNoise = (distance(w1.taps, target.taps) + distance(w2.taps, target.taps)) / 2; noiseOfDistance.push(selfNoise);
    console.log(`\n${cond} · seed ${seed} · ${base.style} ${base.bpm} · clean base vs itself: ${selfNoise.toFixed(2)} · after breaking it: ${distance(before.taps, target.taps).toFixed(2)}`);
    for (let round = 1; round <= ROUNDS; round++) {
      const report = cond === "blind" ? "NO LISTENING REPORT IS AVAILABLE. You have the code only. Still call your shot." : asText(compare(before.master, target.master), "this track as it should sound");
      let got: Suggestion | null = null, refused = 0;
      try { await ask({ dj, skills: [], slots, report, note: "", history: cond === "ears+shots" ? history : history.map((h) => ({ ...h, outcome: undefined })), context: `${base.bpm} BPM, key ${base.key} (bass root midinote ${base.root})` }, (o) => { got ??= o; }, (kind) => { if (kind === "rejected") refused++; }); } catch {}
      const o = got as Suggestion | null, d0 = distance(before.taps, target.taps);
      if (!o) { rows.push({ cond, seed, round, ms: null, refused, slot: "-", call: "-", master: "no idea", tap: "no idea", tapDelta: null, dist_before: d0, dist_after: d0, why: "" }); console.log(`  r${round}  no usable idea`); continue; }
      let ok = true; const onEval = (r: any) => { if (r.id === o.slot && !r.ok) ok = false; }; e.on("evald", onEval);
      e.eval(o.code, o.slot); await nextBar(); await wait(barLen * 0.5); e.off("evald", onEval);
      const after = await window2(); if (ok) slots[o.slot] = o.code;
      const gm = ok ? grade(o.expect, metricDelta(before.master, after.master) as any, masterNoise.floor(o.expect.metric)) : null;
      const gt = ok ? grade(o.expect, mixDiff(before.taps, { ...before.taps, [o.slot]: after.taps[o.slot] }, [before.master, after.master]), tapNoise[o.slot].floor(o.expect.metric)) : null;
      history.push({ slot: o.slot, why: o.why, verdict: "y", id: round, outcome: gt ? forPrompt(o.expect, gt) : "the engine refused this code" });
      const d1 = distance(after.taps, target.taps);
      rows.push({ cond, seed, round, ms: o.ms, refused, slot: o.slot, call: `${o.expect.metric} ${o.expect.dir}`, master: gm?.grade ?? "engine refused", tap: gt?.grade ?? "engine refused", tapDelta: gt?.delta ?? null, dist_before: d0, dist_after: d1, why: o.why });
      console.log(`  r${round}  ${(o.ms / 1000).toFixed(1)}s ${o.slot} calls ${(o.expect.metric + " " + o.expect.dir).padEnd(16)} master ${String(gm?.grade).toUpperCase().padEnd(5)} tap ${String(gt?.grade).toUpperCase().padEnd(5)} ${(gt?.text ?? "").padEnd(34).slice(0, 34)} dist ${d0.toFixed(2)}→${d1.toFixed(2)}  ${o.why.slice(0, 52)}`);
      before = after;
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN), pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + "%" : "-");
  const line = (c: string) => { const r = rows.filter((x) => x.cond === c), ideas = r.filter((x) => x.ms), g = (key: "master" | "tap", v: string) => ideas.filter((x) => x[key] === v).length;
    const start = mean(r.filter((x) => x.round === 1).map((x) => x.dist_before)), end = mean(r.filter((x) => x.round === ROUNDS).map((x) => x.dist_after)), helped = ideas.filter((x) => x.dist_after < x.dist_before - 0.02).length;
    return `| ${c} | ${ideas.length} | ${pct(g("tap", "hit"), ideas.length)} (${g("tap", "hit")}/${g("tap", "miss")}/${g("tap", "flat")}) | ${pct(g("master", "hit"), ideas.length)} (${g("master", "hit")}/${g("master", "miss")}/${g("master", "flat")}) | ${start.toFixed(2)} → ${end.toFixed(2)} | ${pct(helped, ideas.length)} | ${(mean(ideas.map((x) => x.ms!)) / 1000).toFixed(1)} | ${r.reduce((a, x) => a + x.refused, 0)} |`; };
  const table = ["| condition | ideas | calls that came true, per-slot taps (hit/miss/flat) | same calls graded on the master | distance from the clean base: start → end | ideas that moved it closer | s / idea | refusals |", "|---|---|---|---|---|---|---|---|", ...CONDS.map(line)].join("\n");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"), file = path.join(ROOT, "docs/bench", `${stamp}.md`);
  fs.writeFileSync(file, `# EARS benchmark · ${stamp}\n\n${SEEDS.length} seeds × ${ROUNDS} rounds × ${CONDS.length} conditions · DJ: ${dj.name} · one idea per round (fix angle), auto-taken · muted second engine.\n\nEach base is measured clean (the target), then broken (kick buried, hats 2.6× too loud, low voice's filter 3.2× open). Distance is the dry mix's band balance, brightness and level against the clean base, in tolerances (1.5 dB / 0.15 oct / 1 dB, each capped at 4): 0 is "back where it was". Two windows of the UNCHANGED clean base sit ${mean(noiseOfDistance).toFixed(2)} apart on this scale, so differences smaller than that are noise. Windows are 4 bars.\nCalls are graded from per-slot taps as the change attributable to the edited slot alone, against that slot's own noise floor; the master-mix grade of the same call is shown for comparison. Observational; stochastic patterns; read small differences as noise.\n\n${table}\n\n## Every round\n\n| cond | seed | r | s | slot | call | master | tap | Δ (tap) | distance | why |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.map((r) => `| ${r.cond} | ${r.seed} | ${r.round} | ${r.ms ? (r.ms / 1000).toFixed(1) : "-"} | ${r.slot} | ${r.call} | ${r.master} | ${r.tap} | ${r.tapDelta == null ? "-" : r.tapDelta.toFixed(1)} | ${r.dist_before.toFixed(2)}→${r.dist_after.toFixed(2)} | ${r.why.replace(/\|/g, "/")} |`).join("\n")}\n`);
  fs.writeFileSync(file.replace(".md", ".json"), JSON.stringify(rows, null, 2));
  console.log(`\n${table}\n\nwritten to ${file}`); e.stop(); setTimeout(() => process.exit(0), 900);
});
e.start(true);
