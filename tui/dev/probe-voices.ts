// Third muted engine: do the new vocal instruments load, play, and stay sane?
import { Engine } from "../engine.ts"; import { ensureVox } from "../skills.ts";
const e = new Engine(); let frames: any[] = []; e.on("ears", (f) => frames.push(f)); e.on("log", (l) => console.log("[sc]", l.slice(0, 140))); e.on("evald", (r) => !r.ok && console.log("evald", r));
const db = (x: number) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const take = async (label: string) => { await new Promise((r) => setTimeout(r, 2500)); frames = []; await new Promise((r) => setTimeout(r, 5000)); const m = (g: (f: any) => number) => frames.reduce((s, f) => s + g(f), 0) / Math.max(1, frames.length); console.log(label.padEnd(30), "rms", db(m((f) => f.rms)), "peak", db(Math.max(...frames.map((f) => f.peak), 1e-9)), "centroid", Math.round(m((f) => f.centroid))); };
e.on("ready", async () => {
  e.eval(`~d.(\\d5, \\instrument, \\choir, \\dur, 4, \\midinote, Pseq([[50, 57, 62, 65], [48, 55, 60, 64]], inf), \\vowel, Pseq([0, 3], inf), \\sus, 5, \\amp, 0.12)`, "d5"); await take("choir (a → o)"); e.eval("~hush.(\\d5)", "h");
  const code = `~d.(\\d6, \\instrument, \\voxpad, \\dur, 2, \\buf, ~v.("feel the floor"), \\chop, Pseq([0.2, 0.55], inf), \\note, Pseq([[0, 7], [-2, 5]], inf), \\len, 2.4, \\amp, 0.35)`;
  await ensureVox(e, code, "Samantha"); e.eval(code, "d6"); await take("voxpad (stretched, chords)"); e.eval("~hush.(\\d6)", "h");
  const c2 = `~d.(\\d6, \\instrument, \\vox, \\dur, 1/4, \\buf, ~v.("feel the floor"), \\chop, Pseq([0, 0.3, 0.3, 0.6], inf), \\note, Pseq([0, 3, 7, 10, 7, 3], inf), \\len, 0.16, \\amp, ~x.("X-xX-xX-", 0.5))`;
  e.eval(c2, "d6"); await take("vox (pitched chops)");
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
