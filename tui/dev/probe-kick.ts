import { Engine } from "../engine.ts";
const mode = process.argv[2] || "rows";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l)); e.on("evald", (r) => !r.ok && console.log("evald", r));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
const CODE: Record<string, string> = {
  plain: `~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)`,
  rows: `~d.(\\d1, \\instrument, \\kick, \\dur, 1/4, \\amp, ~x.(["X---X---X---X---", "X---X---X---X-x-"], 0.9))`,
  onerow: `~d.(\\d1, \\instrument, \\kick, \\dur, 1/4, \\amp, ~x.("X---X---X---X---", 0.9))`,
  params: `~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9, \\tune, 48, \\dec, 0.32, \\drive, 1.2)`,
  tempo: `~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)`,
};
e.on("ready", async () => { if (mode === "tempo") e.tempo(146); e.eval(CODE[mode], "d1");
  await new Promise((r) => setTimeout(r, 3000)); frames = []; await new Promise((r) => setTimeout(r, 6000));
  const bad = frames.filter((f) => !(f.peak < 8)), ok = frames.filter((f) => f.peak < 8), m = (g: (f: any) => number) => ok.reduce((s, f) => s + g(f), 0) / Math.max(1, ok.length);
  console.log(mode.padEnd(8), `frames ${frames.length}, bad ${bad.length}`, bad.length ? `(peak ${bad[0].peak})` : "", "| rms", db(m((f) => f.rms)), "sub", db(m((f) => f.bands[0])));
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
