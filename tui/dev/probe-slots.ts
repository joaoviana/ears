// Third muted engine: are per-slot taps alive, and is the master unchanged by the new routing?
import { Engine } from "../engine.ts"; import { makeBase } from "../seed.ts";
const e = new Engine(); let master: any[] = []; const slots: Record<string, any[]> = {};
e.on("ears", (f) => master.push(f)); e.on("slotears", (f: any) => (slots[f.slot] ??= []).push(f)); e.on("log", (l) => console.log("[sc]", l.slice(0, 140))); e.on("evald", (r) => !r.ok && console.log("evald", r));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
e.on("ready", async () => { const b = makeBase(7); e.tempo(b.bpm); for (const [k, c] of Object.entries(b.slots)) if (c) e.eval(c, k);
  await new Promise((r) => setTimeout(r, 5000)); master = []; for (const k in slots) slots[k] = []; await new Promise((r) => setTimeout(r, 7000));
  const m = (xs: any[], g: (f: any) => number) => xs.reduce((s, f) => s + g(f), 0) / Math.max(1, xs.length);
  console.log("master".padEnd(8), "rms", db(m(master, (f) => f.rms)), "peak", db(Math.max(...master.map((f) => f.peak))), "bad frames", master.filter((f) => !(f.peak < 8)).length);
  for (const k of Object.keys(slots).sort()) console.log(k.padEnd(8), "rms", db(m(slots[k], (f) => f.rms)), "centroid", String(Math.round(m(slots[k], (f) => f.centroid))).padStart(5), "frames", slots[k].length, " ", (b.slots[k].match(/\\instrument, \\(\w+)/) || [])[1]);
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
