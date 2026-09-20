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
import fs from "fs"; import path from "path"; import { execSync } from "child_process";
import { Engine, ROOT } from "../engine.ts"; import { Listener, compare, asText, metricDelta, type Profile } from "../report.ts";
import { ask, type Past, type Suggestion } from "../agent.ts"; import { roster } from "../djs.ts"; import { makeBase } from "../seed.ts";
import { parseSlot, applyPatch } from "../patch.ts";
import { NoiseFloor, grade, forPrompt, MIN_SAMPLES, type Differences, type Metric } from "../shots.ts";
import { brief as writeBrief, slotDrift, type Attempt } from "../brief.ts";
import { maskingLines } from "../masking.ts";
process.env.EARS_ANGLES = "1";
const N_SEEDS = Number(process.argv[2] || 2), ROUNDS = Number(process.argv[3] || 6), SEEDS = [41, 7, 77, 12, 33, 5, 21, 64].slice(0, N_SEEDS);
const METRICS_USED: Metric[] = ["sub", "low", "mid", "high", "air", "brightness", "loudness", "width"];   // density and punch have no per-slot measurement
const CONDS = ["blind", "ears", "ears+shots", "brief+shots"] as const, SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6"], BANDS = ["sub", "low", "mid", "high", "air"] as const;
const dj = roster().find((d) => d.id === "resident")!, e = new Engine(), wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let listener = new Listener(), taps: Record<string, { rms: number; centroid: number; bands: number[] }[]> = {}, barLen = 1846, barWaiters: (() => void)[] = [];
e.on("ears", (f) => listener.push(f)); e.on("onset", () => listener.onset()); e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f));
e.on("hit", (h: any) => listener.hit(h.offGrid ?? 0));
e.on("bar", ({ bpm }) => { barLen = (240 / bpm) * 1000; listener.bar(); barWaiters.splice(0).forEach((f) => f()); });
e.on("log", (l) => /ERROR/.test(l) && console.log("   [sc]", l.slice(0, 100)));
const nextBar = () => new Promise<void>((r) => barWaiters.push(r));

interface Tap { power: number; bands: number[]; centroid: number }
interface Win { master: Profile; taps: Record<string, Tap>; frames: { slot: string; bands: number[] }[] }
const window2 = async (): Promise<Win> => { for (let attempt = 0; attempt < 4; attempt++) { const w = await windowOnce(); if (w.master) return w; console.log("   (empty window, listening again)"); } throw new Error("no audio frames are arriving from the engine"); };
const windowOnce = async (): Promise<Win> => {
  await nextBar(); listener = new Listener(); taps = {}; for (let i = 0; i < 4; i++) await nextBar();   // four bars: the grooves turn around every fourth bar, and the hats are random
  const t: Record<string, Tap> = {};
  for (const k of SLOTS) { const f = taps[k] || [], n = Math.max(1, f.length), pw = f.map((x) => x.rms * x.rms), tot = pw.reduce((a, b) => a + b, 0); t[k] = { power: tot / n, bands: [0, 1, 2, 3, 4].map((i) => f.reduce((a, x) => a + x.bands[i] * x.bands[i], 0) / n), centroid: tot > 0 ? f.reduce((a, x, j) => a + x.centroid * pw[j], 0) / tot : 0 }; }
  return { master: listener.take()!, taps: t, frames: SLOTS.flatMap((k) => (taps[k] || []).map((x) => ({ slot: k, bands: x.bands }))) };
};
const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
/** the dry mix rebuilt from the taps: total level, band balance, brightness */
const mix = (t: Record<string, Tap>) => { const tot = SLOTS.reduce((a, k) => a + t[k].power, 0), bands = [0, 1, 2, 3, 4].map((i) => SLOTS.reduce((a, k) => a + t[k].bands[i], 0)); return { loud: dB(tot), rel: bands.map((b) => dB(b) - dB(tot)), centroid: SLOTS.reduce((a, k) => a + t[k].centroid * t[k].power, 0) / Math.max(tot, 1e-12) }; };
const mixDiff = (a: Record<string, Tap>, b: Record<string, Tap>, master?: [Profile, Profile]): Differences => { const x = mix(a), y = mix(b), m = master ? metricDelta(master[0], master[1]) as any : { onsets_per_beat: 0, peak_to_envelope_db: 0 }; return { envelope_db: y.loud - x.loud, centroid_hz: y.centroid - x.centroid, relative_bands_db: Object.fromEntries(BANDS.map((n, i) => [n, y.rel[i] - x.rel[i]])), onsets_per_beat: m.onsets_per_beat, peak_to_envelope_db: m.peak_to_envelope_db }; };
const asMetrics = (d: Differences): Partial<Record<Metric, number>> => ({ ...d.relative_bands_db, brightness: d.centroid_hz, loudness: d.envelope_db, density: d.onsets_per_beat, punch: d.peak_to_envelope_db, width: d.width_db, groove: (d.off_grid_beats ?? 0) * 1000 } as any);
/** how far the dry mix is from the clean base, in tolerances (1.5 dB per band, 0.15 octave of brightness, 1 dB level), each capped at 4 */
const distance = (t: Record<string, Tap>, target: Record<string, Tap>) => { const a = mix(t), b = mix(target), cap = (x: number) => Math.min(4, x); return ([...a.rel.map((v, i) => cap(Math.abs(v - b.rel[i]) / 1.5)), cap(Math.abs(Math.log2(a.centroid / b.centroid)) / 0.15), cap(Math.abs(a.loud - b.loud) / 1)]).reduce((x, y) => x + y, 0) / 7; };
/** deliberately worse: the kick buried, the hats too loud, the low voice's filter wide open */
/**
 * Deliberately worse: the kick buried, the hats far too loud, the low voice's filter wide open. The damage is
 * folded into the numbers rather than appended as `* 2.6`, so the source looks like a track somebody wrote badly.
 * Otherwise the code itself is an answer key and the "blind" condition is not blind at all.
 */
const scaleNumbers = (value: string, by: number, clamp = 20000) => value.replace(/\d+(\.\d+)?/g, (n) => String(Math.round(Math.min(clamp, Number(n) * by) * 100) / 100));
const breakIt = (slots: Record<string, string>) => { const out = { ...slots }, val = (code: string, key: string) => parseSlot(code).find((p) => p.key === key)?.value;
  out.d1 = out.d1.replace(/, 0\.9\)/, ", 0.3)");
  const hat = val(out.d2, "amp"); if (hat) out.d2 = applyPatch(out.d2, { slot: "d2", set: [{ key: "amp", value: scaleNumbers(hat, 2.6, 1) }] });
  const cut = val(out.d4, "cutoff"); out.d4 = applyPatch(out.d4, { slot: "d4", set: [{ key: "cutoff", value: cut ? scaleNumbers(cut, 3.2, 6000) : "3600" }] });
  return out; };

interface Row { cond: string; seed: number; round: number; calibrated?: boolean; ms: number | null; refused: number; slot: string; call: string; master: string; tap: string; tapDelta: number | null; dist_before: number; dist_after: number; why: string }
const rows: Row[] = [], noiseOfDistance: number[] = [];
const stamp0 = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"), live = path.join(ROOT, "docs/bench", `${stamp0}.rounds.jsonl`); fs.mkdirSync(path.dirname(live), { recursive: true });
const keep = (r: Row) => { rows.push(r); fs.appendFileSync(live, JSON.stringify(r) + "\n"); };
const ONLY = (process.env.BENCH_CONDS || "").split(",").filter(Boolean), T0 = Date.now(), clock = () => `${Math.floor((Date.now() - T0) / 60000)}m${String(Math.floor(((Date.now() - T0) / 1000) % 60)).padStart(2, "0")}`;

e.on("ready", async () => {
  for (const cond of CONDS.filter((c) => !ONLY.length || ONLY.includes(c))) for (const seed of SEEDS) {
    const base = makeBase(seed, "dark"), clean = base.slots;   // the dark family, so results stay comparable with earlier runs
    e.eval("Pdef.all.do(_.stop); 1", "stop"); e.tempo(base.bpm); await wait(barLen * 1.2);
    for (const k of SLOTS) if (clean[k]) e.eval(clean[k], k);
    await nextBar(); await nextBar();
    // Calibration: MIN_SAMPLES+1 windows of the UNCHANGED clean base, so each consecutive pair is one independent
    // sample of "how much this music moves on its own". With fewer, the floors silently fall back to fixed
    // defaults and small changes look like hits.
    const cal: Win[] = []; for (let i = 0; i <= MIN_SAMPLES; i++) cal.push(await window2());
    const target = cal[cal.length - 1], masterNoise = new NoiseFloor(), tapNoise: Record<string, NoiseFloor> = Object.fromEntries(SLOTS.map((k) => [k, new NoiseFloor()]));
    for (let i = 1; i < cal.length; i++) { const a = cal[i - 1], b = cal[i]; masterNoise.sample(asMetrics(metricDelta(a.master, b.master) as any)); for (const k of SLOTS) tapNoise[k].sample(asMetrics(mixDiff(a.taps, { ...a.taps, [k]: b.taps[k] }))); }
    const calibrated = METRICS_USED.every((m) => masterNoise.ready(m) && SLOTS.every((k) => tapNoise[k].ready(m)));
    const slots = breakIt(clean); for (const k of ["d1", "d2", "d4"]) e.eval(slots[k], k);
    await nextBar(); await wait(barLen * 0.5);
    let before = await window2(); const history: Past[] = [], attempts: Attempt[] = [];
    const selfNoise = cal.slice(0, -1).reduce((a, w) => a + distance(w.taps, target.taps), 0) / (cal.length - 1); noiseOfDistance.push(selfNoise);
    if (!calibrated) console.log("   (noise floors not fully calibrated for this seed)");
    console.log(`\n${cond} · seed ${seed} · ${base.style} ${base.bpm} · clean base vs itself: ${selfNoise.toFixed(2)} · after breaking it: ${distance(before.taps, target.taps).toFixed(2)} · floors from ${cal.length - 1} baseline pairs`);
    for (let round = 1; round <= ROUNDS; round++) {
      const worstSlot = slotDrift(before.taps, target.taps)[0]?.slot ?? "d1";
      const lines = compare(before.master, target.master);
      const report = cond === "blind" ? "NO LISTENING REPORT IS AVAILABLE. You have the code only. Still call your shot."
        : cond === "brief+shots" ? writeBrief(lines, "this track as it should sound", slotDrift(before.taps, target.taps), Object.fromEntries(METRICS_USED.map((m) => [m, tapNoise[worstSlot].floor(m)])), attempts, maskingLines(before.frames))
        : asText(lines, "this track as it should sound");
      let got: Suggestion | null = null, refused = 0;
      try { await ask({ dj, skills: [], slots, report, note: "", history: cond.includes("shots") ? history : history.map((h) => ({ ...h, outcome: undefined })), context: `${base.bpm} BPM, key ${base.key} (bass root midinote ${base.root})` }, (o) => { got ??= o; }, (kind) => { if (kind === "rejected") refused++; }); } catch {}
      const o = got as Suggestion | null, d0 = distance(before.taps, target.taps);
      if (!o) { keep({ cond, seed, round, calibrated, ms: null, refused, slot: "-", call: "-", master: "no idea", tap: "no idea", tapDelta: null, dist_before: d0, dist_after: d0, why: "" }); console.log(`  r${round}  no usable idea`); continue; }
      let ok = true; const onEval = (r: any) => { if (r.id === o.slot && !r.ok) ok = false; }; e.on("evald", onEval);
      e.eval(o.code, o.slot); await nextBar(); await wait(barLen * 0.5); e.off("evald", onEval);
      const after = await window2(); if (ok) slots[o.slot] = o.code;
      const gm = ok ? grade(o.expect, metricDelta(before.master, after.master) as any, masterNoise.floor(o.expect.metric)) : null;
      const gt = ok ? grade(o.expect, mixDiff(before.taps, { ...before.taps, [o.slot]: after.taps[o.slot] }, [before.master, after.master]), tapNoise[o.slot].floor(o.expect.metric)) : null;
      history.push({ slot: o.slot, why: o.why, verdict: "y", id: round, outcome: gt ? forPrompt(o.expect, gt) : "the engine refused this code" });
      attempts.push({ metric: o.expect.metric, slot: o.slot, grade: gt?.grade ?? "ungraded" });
      const d1 = distance(after.taps, target.taps);
      keep({ cond, seed, round, calibrated, ms: o.ms, refused, slot: o.slot, call: `${o.expect.metric} ${o.expect.dir}`, master: gm?.grade ?? "engine refused", tap: gt?.grade ?? "engine refused", tapDelta: gt?.delta ?? null, dist_before: d0, dist_after: d1, why: o.why });
      console.log(`  ${clock()} r${round}  ${(o.ms / 1000).toFixed(1)}s ${o.slot} calls ${(o.expect.metric + " " + o.expect.dir).padEnd(16)} master ${String(gm?.grade).toUpperCase().padEnd(5)} tap ${String(gt?.grade).toUpperCase().padEnd(5)} ${(gt?.text ?? "").padEnd(34).slice(0, 34)} dist ${d0.toFixed(2)}→${d1.toFixed(2)}  ${o.why.slice(0, 52)}`);
      before = after;
    }
  }
  const commit = (() => { try { return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "unknown"; } })(), rate = e.sampleRate || 0;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN), pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + "%" : "-");
  const line = (c: string) => { const r = rows.filter((x) => x.cond === c), ideas = r.filter((x) => x.ms), g = (key: "master" | "tap", v: string) => ideas.filter((x) => x[key] === v).length;
    const start = mean(r.filter((x) => x.round === 1).map((x) => x.dist_before)), end = mean(r.filter((x) => x.round === ROUNDS).map((x) => x.dist_after)), helped = ideas.filter((x) => x.dist_after < x.dist_before - 0.02).length;
    return `| ${c} | ${ideas.length} | ${pct(g("tap", "hit"), ideas.length)} (${g("tap", "hit")}/${g("tap", "miss")}/${g("tap", "flat")}) | ${pct(g("master", "hit"), ideas.length)} (${g("master", "hit")}/${g("master", "miss")}/${g("master", "flat")}) | ${start.toFixed(2)} → ${end.toFixed(2)} | ${pct(helped, ideas.length)} | ${(mean(ideas.map((x) => x.ms!)) / 1000).toFixed(1)} | ${r.reduce((a, x) => a + x.refused, 0)} |`; };
  const table = ["| condition | ideas | calls that came true, per-slot estimate (hit/miss/flat) | same calls graded on the master | distance from the clean base: start → end | ideas that moved it closer | s / idea | refusals |", "|---|---|---|---|---|---|---|---|", ...CONDS.map(line)].join("\n");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"), file = path.join(ROOT, "docs/bench", `${stamp}.md`);
  fs.writeFileSync(file, `# EARS benchmark · ${stamp}\n\n${SEEDS.length} seeds × ${ROUNDS} rounds × ${CONDS.length} conditions · DJ: ${dj.name} · one idea per round (fix angle), auto-taken · muted second engine.\nModel ${process.env.EARS_MODEL || "sonnet"} at ${process.env.EARS_EFFORT || "low"} effort · commit ${commit} · engine sample rate ${rate} Hz · seeds ${SEEDS.join(", ")} · noise floors from ${MIN_SAMPLES} baseline pairs per metric per slot.\n\nEach base is measured clean (the target), then broken (kick buried, hats 2.6× too loud, low voice's filter 3.2× open). Distance is the dry mix's band balance, brightness and level against the clean base, in tolerances (1.5 dB / 0.15 oct / 1 dB, each capped at 4): 0 is "back where it was". Two windows of the UNCHANGED clean base sit ${mean(noiseOfDistance).toFixed(2)} apart on this scale, so differences smaller than that are noise. Windows are 4 bars.\n**What the two grading columns are.** The per-slot column is an *approximate dry-slot contribution estimate*: the dry mix is recomputed from each slot's own summary with the edited slot's after-summary substituted in, so other voices are held at their before-measurements. It is not a controlled re-render: the edited voice still varies with its own randomness, and shared effects and master processing sit outside these dry summaries. Band balance, brightness and level are genuinely per-slot; density and punch have no per-slot measurement and fall back to the master delta (marked * in the round table). The master column is what the live host grades today. Observational; stochastic patterns; read small differences as noise.\n\n${table}\n\n## Every round\n\n| cond | seed | r | s | slot | call | master | per-slot | Δ | distance | why |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.map((r) => `| ${r.cond} | ${r.seed} | ${r.round} | ${r.ms ? (r.ms / 1000).toFixed(1) : "-"} | ${r.slot} | ${r.call} | ${r.master} | ${r.tap}${/^(density|punch)/.test(r.call) ? "*" : ""} | ${r.tapDelta == null ? "-" : r.tapDelta.toFixed(1)} | ${r.dist_before.toFixed(2)}→${r.dist_after.toFixed(2)} | ${r.why.replace(/\|/g, "/")} |`).join("\n")}\n`);
  fs.writeFileSync(file.replace(".md", ".json"), JSON.stringify(rows, null, 2));
  console.log(`\n${table}\n\nwritten to ${file}`); e.stop(); setTimeout(() => process.exit(0), 900);
});
e.start(true);
