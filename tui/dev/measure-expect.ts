// What does each ambient gesture really move? Lands each one over the base on a muted engine and measures it the
// way the live grader does: the changed slot's own tap (dry-mix contribution) and the master, before vs after.
//   EARS_PORT=57341 EARS_SC_PORT=57191 npx tsx tui/dev/measure-expect.ts out.json <gestureId ...>
//   (slot_own is what the live grader uses: the layer's own tap; slot_dry is its contribution to the mix, for reference)
//   then: python3 tui/dev/derive-expect.py out.json [more.json] --write   (rewrites each gesture's expect and MEASURED)
import fs from "node:fs";
import { Engine, type EngineEvents } from "../engine.ts";
import { makeBase } from "../seed.ts";
import { AMBIENT_ARSENAL } from "../ambient-arsenal.ts";
import { applyPatch } from "../patch.ts";
import { SlotEars, slotDifference, slotOwnDifference } from "../slotears.ts";
const out = process.argv[2], ids = process.argv.slice(3);
const engine = new Engine(), ears = new SlotEars(120000);
const master: { at: number; rms: number; centroid: number; bands: number[] }[] = []; const onsets: number[] = [];
engine.on("slotears", (f) => ears.push(f)); engine.on("ears", (f) => master.push({ at: Date.now(), ...f })); engine.on("onset", () => onsets.push(Date.now()));
engine.on("log", (m) => { if (/error|fail/i.test(m)) console.error(`[engine] ${m}`); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onceWhere = <K extends keyof EngineEvents>(event: K, accept: (...a: EngineEvents[K]) => boolean, timeout = 40000) =>
  new Promise<EngineEvents[K]>((resolve, reject) => {
    const done = (...a: EngineEvents[K]) => { if (!accept(...a)) return; cleanup(); resolve(a); };
    const cleanup = () => { clearTimeout(t); engine.off(event, done as never); };
    const t = setTimeout(() => { cleanup(); reject(new Error(`${String(event)} timed out`)); }, timeout);
    engine.on(event, done as never);
  });
async function land(code: string, slot: string, tag: string) {
  const ex = `${tag}-${Date.now()}`;
  const ev = onceWhere("evald", (r) => r.execution_id === ex), ac = onceWhere("active", (r) => r.execution_id === ex);
  engine.eval(code, slot, ex);
  const [r] = await ev; if (!r.ok) throw new Error(`${tag}: ${r.msg}`);
  const [a] = await ac; return Date.now();
}
const dB = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
const masterWindow = (from: number, to: number, bpm: number) => {
  const xs = master.filter((f) => f.at >= from && f.at <= to); if (xs.length < 5) return null;
  const env = xs.reduce((a, f) => a + dB(f.rms), 0) / xs.length;
  const bands = ["sub", "low", "mid", "high", "air"].map((n, i) => [n, xs.reduce((a, f) => a + dB(f.bands[i]), 0) / xs.length - env] as const);
  return { envelope_db: env, centroid_hz: xs.reduce((a, f) => a + f.centroid, 0) / xs.length, relative_bands_db: Object.fromEntries(bands), onsets_per_beat: onsets.filter((t) => t >= from && t <= to).length / (((to - from) / 1000) * bpm / 60) };
};
const diff = (a: NonNullable<ReturnType<typeof masterWindow>>, b: typeof a) => ({ envelope_db: b.envelope_db - a.envelope_db, centroid_hz: b.centroid_hz - a.centroid_hz, onsets_per_beat: b.onsets_per_beat - a.onsets_per_beat, peak_to_envelope_db: 0,
  relative_bands_db: Object.fromEntries(Object.keys(a.relative_bands_db).map((k) => [k, b.relative_bands_db[k] - a.relative_bands_db[k]])) });
try {
  const ready = onceWhere("ready", () => true);
  await engine.start(true); await ready;
  const base = makeBase(260921, "vibey", "ambient"); engine.tempo(base.bpm);
  await Promise.all(Object.entries(base.slots).map(([slot, code]) => land(code, slot, `base-${slot}`)));
  await wait(34000);
  // wobble: two consecutive quiet windows of the base with nothing changed
  const w1 = [Date.now() - 32000, Date.now() - 16000], w2 = [Date.now() - 16000, Date.now()];
  const result: Record<string, unknown> = { wobble: { master: diff(masterWindow(w1[0], w1[1], base.bpm)!, masterWindow(w2[0], w2[1], base.bpm)!),
    slots: Object.fromEntries(Object.keys(base.slots).map((slot) => [slot, slotDifference(ears.all(w1[0], w1[1]), ears.all(w2[0], w2[1]), slot, { onsets_per_beat: 0, peak_to_envelope_db: 0 })])) } };
  for (const id of ids) {
    const g = AMBIENT_ARSENAL.find((s) => s.id === id); if (!g) continue;
    const current = base.slots[g.slot] || "", code = g.transform && current.trim() ? applyPatch(current, { slot: g.slot, set: g.transform }) : g.code;
    const t0 = Date.now(), beforeSlots = ears.all(t0 - 16000, t0), beforeMaster = masterWindow(t0 - 16000, t0, base.bpm)!;
    const at = await land(code, g.slot, id);
    await wait(30000);
    const afterSlots = ears.all(at + 14000, at + 30000), afterMaster = masterWindow(at + 14000, at + 30000, base.bpm)!;
    const m = diff(beforeMaster, afterMaster);
    result[id] = { slot: g.slot, expect: g.expect, master: m, slot_dry: slotDifference(beforeSlots, afterSlots, g.slot, { onsets_per_beat: m.onsets_per_beat, peak_to_envelope_db: 0 }), slot_own: slotOwnDifference(beforeSlots, afterSlots, g.slot, { onsets_per_beat: m.onsets_per_beat, peak_to_envelope_db: 0 }) };
    console.log(id, JSON.stringify(result[id]).slice(0, 200));
    await land(base.slots[g.slot], g.slot, `restore-${g.slot}`); await wait(12000);
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
} finally { engine.stop(); await wait(800); }
