// Spare muted engine: play a base, fire each transition, and watch level / brightness / bad frames through the ride.
import { Engine } from "../engine.ts"; import { makeBase } from "../seed.ts";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push({ ...f, at: Date.now() })); e.on("log", (l) => console.log("[sc]", l.slice(0, 140)));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
const show = (label: string, fs: any[]) => { const ok = fs.filter((f) => Number.isFinite(f.rms)), m = (g: (f: any) => number) => ok.reduce((s, f) => s + g(f), 0) / Math.max(1, ok.length); console.log(label.padEnd(26), "rms", db(m((f) => f.rms)), "max rms", db(Math.max(...ok.map((f) => f.rms), 1e-9)), "centroid", String(Math.round(m((f) => f.centroid))).padStart(5), "max centroid", String(Math.round(Math.max(...ok.map((f) => f.centroid), 0))).padStart(5), "non-finite", fs.length - ok.length); };
e.on("ready", async () => { const b = makeBase(7); e.tempo(b.bpm); for (const [k, c] of Object.entries(b.slots)) if (c) e.eval(c, k);
  await new Promise((r) => setTimeout(r, 6000)); frames = []; await new Promise((r) => setTimeout(r, 4000)); show("normal playback", frames);
  for (const kind of ["build", "wash", "riser"] as const) { frames = []; e.transition(kind, 2); await new Promise((r) => setTimeout(r, 4200)); show(`during ${kind}`, frames); frames = []; await new Promise((r) => setTimeout(r, 3000)); show(`  after ${kind}`, frames); }
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
