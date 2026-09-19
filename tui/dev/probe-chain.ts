// Kick + hats on a fresh muted engine, with parts of the master chain removed, counting bad frames.
import { Engine } from "../engine.ts";
const mode = process.argv[2] || "full";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
e.on("ready", async () => {
  if (mode === "no-djfx") e.eval("~djfx.free; 1", "x");
  if (mode === "no-space") e.eval("~space.free; 1", "x");
  if (mode === "no-both") e.eval("~djfx.free; ~space.free; 1", "x");
  await new Promise((r) => setTimeout(r, 500));
  e.eval(`~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)`, "d1"); e.eval(`~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, 0.2)`, "d2");
  await new Promise((r) => setTimeout(r, 2500)); frames = []; await new Promise((r) => setTimeout(r, 6000));
  const bad = frames.filter((f) => !(f.peak < 8)), ok = frames.filter((f) => f.peak < 8), m = (g: (f: any) => number) => ok.reduce((s, f) => s + g(f), 0) / Math.max(1, ok.length);
  console.log(mode.padEnd(10), `frames ${frames.length}, bad ${bad.length}`, bad.length ? `(e.g. peak ${bad[0].peak}, rms ${bad[0].rms})` : "", "| rms", db(m((f) => f.rms)), "sub", db(m((f) => f.bands[0])));
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
