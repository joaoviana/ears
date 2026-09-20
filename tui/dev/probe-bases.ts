// How does each seeded base actually measure? Muted engine, four bars per style, per-slot taps on.
// "Ominous" is a dark centroid, no air, and the harmony buried under the drums — all of which the ears already report.
//   EARS_PORT=57360 EARS_SC_PORT=57201 npx tsx tui/dev/probe-bases.ts [mood]
import { Engine } from "../engine.ts"; import { makeBase, STYLE_NAMES } from "../seed.ts";
const ONLY = process.argv.slice(2).filter((x) => !x.startsWith("-"));
const e = new Engine(), SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6"];
let frames: any[] = [], taps: Record<string, any[]> = {}, bars = 0, waiters: (() => void)[] = [];
e.on("ears", (f) => frames.push(f)); e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f));
e.on("bar", () => { bars++; waiters.splice(0).forEach((f) => f()); });
e.on("log", (l) => /ERROR/.test(l) && console.log("[sc]", l.slice(0, 120)));
const nextBar = () => new Promise<void>((r) => waiters.push(r));
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
e.on("ready", async () => {
  console.log("style".padEnd(14), "cent".padStart(6), "air".padStart(6), "low".padStart(6), " harmony vs drums", "  per-slot dBFS");
  const rows: any[] = [];
  for (const name of (ONLY.length ? ONLY : STYLE_NAMES)) {
    const b = makeBase(4821, "any", name);
    e.eval("Pdef.all.do(_.stop); 1", "stop"); e.tempo(b.bpm); await nextBar();
    for (const k of SLOTS) e.eval(b.slots[k] || `~hush.(\\${k})`, k);
    await nextBar(); await nextBar(); frames = []; taps = {};
    for (let i = 0; i < 4; i++) await nextBar();
    const n = Math.max(frames.length, 1);
    const cen = frames.reduce((a, f) => a + f.centroid, 0) / n;
    const rms = frames.reduce((a, f) => a + f.rms, 0) / n;
    const band = (i: number) => db(frames.reduce((a, f) => a + f.bands[i], 0) / n) - db(rms);
    const slot = (k: string) => { const t = taps[k] || []; return t.length ? db(Math.sqrt(t.reduce((a, x) => a + x.rms * x.rms, 0) / t.length)) : -99; };
    const drums = Math.max(slot("d1"), slot("d2"), slot("d3")), harm = Math.max(slot("d5"), slot("d6"));
    rows.push({ name, cen, air: band(4), low: band(1), gap: harm - drums });
    console.log(name.padEnd(14), Math.round(cen).toString().padStart(6), band(4).toFixed(1).padStart(6), band(1).toFixed(1).padStart(6),
      `${(harm - drums).toFixed(1).padStart(10)} dB`, "  " + SLOTS.map((k) => `${k} ${slot(k).toFixed(0)}`).join(" "));
  }
  const mean = (g: (x: any) => number) => rows.reduce((a, x) => a + g(x), 0) / rows.length;
  console.log(`\nmean centroid ${Math.round(mean((x) => x.cen))} Hz · mean air ${mean((x) => x.air).toFixed(1)} dB · mean harmony-under-drums ${mean((x) => x.gap).toFixed(1)} dB`);
  e.stop(); setTimeout(() => process.exit(0), 900);
});
e.start(true);
