// What does the engine output when nothing is playing? Then free parts of the master chain to find the culprit.
import { Engine } from "../engine.ts";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const measure = async (label: string, secs = 4) => { frames = []; await new Promise((r) => setTimeout(r, secs * 1000)); const m = (g: (f: any) => number) => frames.reduce((s, f) => s + g(f), 0) / Math.max(1, frames.length); console.log(label.padEnd(34), "rms", db(m((f) => f.rms)), "dB  peak", db(Math.max(...frames.map((f) => f.peak))), "dB  bands", [0, 1, 2, 3, 4].map((i) => db(m((f) => f.bands[i]))).join(" ")); };
e.on("ready", async () => {
  await measure("silence, 0-4 s after boot"); await measure("silence, 4-8 s"); await measure("silence, 8-12 s");
  e.eval("~djfx.free; 1", "x"); await measure("after freeing djfx");
  e.eval("~space.free; 1", "x"); await measure("after freeing space (echo+reverb)");
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
