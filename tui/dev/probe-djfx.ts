// Spare muted engine: swap the transition mixer for variants, switch it ON with neutral settings, and measure.
import { Engine } from "../engine.ts"; import { makeBase } from "../seed.ts";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l.slice(0, 160))); e.on("evald", (r) => !r.ok && console.log("evald", r));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
const measure = async (label: string) => { await new Promise((r) => setTimeout(r, 1500)); frames = []; await new Promise((r) => setTimeout(r, 3500)); const m = (g: (f: any) => number) => frames.reduce((s, f) => s + g(f), 0) / Math.max(1, frames.length); console.log(label.padEnd(44), "rms", db(m((f) => f.rms)), "centroid", String(Math.round(m((f) => f.centroid))).padStart(5)); };
const def = (body: string) => `SynthDef(\\djfxT, { |on = 1| var dry = ~safe.(In.ar(0, 2)), wet; ${body} ReplaceOut.ar(0, Select.ar(on > 0.5, [dry, ~safe.(wet)])); }).add; 1`;
const variants: [string, string][] = [
  ["dry (on = 0)", "wet = dry;"],
  ["pass-through, on", "wet = dry;"],
  ["HPF 30 Hz x2", "wet = HPF.ar(HPF.ar(dry, 30), 30);"],
  ["LPF 18 kHz x2", "wet = LPF.ar(LPF.ar(dry, 18000), 18000);"],
  ["both, as shipped (with lag + clip)", "wet = HPF.ar(HPF.ar(dry, DC.kr(30).clip(30, 8000).lag(0.08)), DC.kr(30).clip(30, 8000).lag(0.08)); wet = LPF.ar(LPF.ar(wet, DC.kr(18000).clip(200, 18000).lag(0.08)), DC.kr(18000).clip(200, 18000).lag(0.08));"],
  ["as shipped + CombL with echo 0", "wet = HPF.ar(HPF.ar(dry, 30), 30); wet = LPF.ar(LPF.ar(wet, 18000), 18000); wet = wet + CombL.ar(wet * 0, 1, 0.346, 3.5);"],
];
e.on("ready", async () => { const b = makeBase(7); e.tempo(b.bpm); for (const [k, c] of Object.entries(b.slots)) if (c) e.eval(c, k); await new Promise((r) => setTimeout(r, 5000));
  for (const [i, [name, body]] of variants.entries()) { e.eval(def(body), "def"); await new Promise((r) => setTimeout(r, 500)); e.eval(`~djfx.free; ~djfx = Synth.after(~space, \\djfxT, [\\on, ${i === 0 ? 0 : 1}]); 1`, "swap"); await measure(name); }
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
