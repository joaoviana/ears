// One base, straight after boot, measured second by second; optionally voice by voice.
import { Engine } from "../engine.ts"; import { makeBase } from "../seed.ts";
const e = new Engine(), seed = Number(process.argv[2] || 41); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l)); e.on("evald", (r) => !r.ok && console.log("evald", r));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
const take = async (label: string, secs: number) => { frames = []; await new Promise((r) => setTimeout(r, secs * 1000)); const ok = frames.filter((f) => f.peak < 8), m = (g: (f: any) => number) => ok.reduce((s, f) => s + g(f), 0) / Math.max(1, ok.length); console.log(label.padEnd(22), `frames ${frames.length} (glitch ${frames.length - ok.length})`, "rms", db(m((f) => f.rms)), "peak", db(Math.max(...ok.map((f) => f.peak), 1e-9)), "bands", [0, 1, 2, 3, 4].map((i) => db(m((f) => f.bands[i]))).join(" ")); };
e.on("ready", async () => { const b = makeBase(seed); console.log(b.style, b.bpm, b.key); e.tempo(b.bpm);
  for (const [k, code] of Object.entries(b.slots)) { if (!code) continue; e.eval(code, k); await take("+ " + k + " " + (code.match(/\\instrument, \\(\w+)/)?.[1] ?? ""), 4); }
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
