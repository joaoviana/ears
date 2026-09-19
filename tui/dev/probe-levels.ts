// Plays one seed per style on a muted second engine and prints what the ears measure, to catch a style that is
// wildly louder, quieter or more lopsided than the rest.
import { Engine } from "../engine.ts"; import { makeBase } from "../seed.ts";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-6))).toFixed(1).padStart(6);
e.on("ready", async () => { const seen = new Set<string>();
  for (let seed = 1; seen.size < 6 && seed < 200; seed++) { const b = makeBase(seed); if (seen.has(b.style)) continue; seen.add(b.style);
    e.eval("Pdef.all.do(_.stop)", "stop"); e.tempo(b.bpm); await new Promise((r) => setTimeout(r, 2200));
    for (const [k, code] of Object.entries(b.slots)) if (code) e.eval(code, k);
    await new Promise((r) => setTimeout(r, 3000)); frames = []; await new Promise((r) => setTimeout(r, 7000));
    const ok = frames.filter((f) => f.peak < 8), m = (g: (f: any) => number) => ok.reduce((s, f) => s + g(f), 0) / ok.length;
    console.log(b.style.padEnd(12), String(b.bpm).padStart(3), "rms", db(m((f) => f.rms)), " peak", db(Math.max(...ok.map((f) => f.peak))), " bands", [0, 1, 2, 3, 4].map((i) => db(m((f) => f.bands[i]))).join(" ")); }
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
