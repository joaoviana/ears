// Do the new colours load, play, and stay sane? Muted engine, its own ports. Measures each voice alone:
// level, peak, spectral centroid. It cannot tell you whether they sound good — nothing here can.
//   EARS_PORT=57350 EARS_SC_PORT=57199 npx tsx tui/dev/probe-new-voices.ts
import { Engine } from "../engine.ts";
const e = new Engine(); let frames: any[] = [], errors: string[] = [];
e.on("ears", (f) => frames.push(f));
e.on("log", (l) => { if (/ERROR|FAILURE|exception/i.test(l)) { errors.push(l.slice(0, 160)); console.log("[sc]", l.slice(0, 160)); } });
e.on("evald", (r: any) => { if (!r.ok) { errors.push(`${r.id}: ${r.msg}`); console.log("REFUSED", r.id, String(r.msg).slice(0, 140)); } });
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VOICES: [string, string][] = [
  ["snare", `\\instrument, \\snare, \\dur, 1, \\amp, ~x.("----X-------X---", 0.4), \\freq, 190, \\snap, 0.7`],
  ["rim", `\\instrument, \\rim, \\dur, 1/4, \\amp, ~x.("--x---x---x---x-", 0.3), \\freq, Pwhite(1400, 2100)`],
  ["sub", `\\instrument, \\sub, \\dur, 1, \\amp, 0.5, \\midinote, Pseq([31, 31, 36, 34], inf), \\dec, 0.6, \\drop, 0.5`],
  ["reese", `\\instrument, \\reese, \\dur, 2, \\amp, 0.3, \\midinote, Pseq([31, 34], inf), \\detune, 0.8, \\cutoff, 700, \\rate, 0.4`],
  ["reese+crush", `\\instrument, \\reese, \\dur, 2, \\amp, 0.3, \\midinote, 31, \\crush, 0.7, \\fold, 0.4`],
  ["pluck", `\\instrument, \\pluck, \\dur, 1/2, \\amp, 0.3, \\midinote, Pseq([67, 72, 74, 79], inf), \\dec, 1.1, \\tone, 0.6`],
  ["noise (riser)", `\\instrument, \\noise, \\dur, 4, \\amp, 0.12, \\freq, 900, \\sweep, 4, \\att, 1.2, \\dec, 2.4, \\bw, 0.6`],
  ["bass+crush", `\\instrument, \\bass, \\dur, 1/2, \\amp, 0.6, \\midinote, 31, \\cutoff, 900, \\crush, 0.8, \\fold, 0.5`],
  ["stab+fold", `\\instrument, \\stab, \\dur, 1, \\amp, 0.2, \\midinote, [62, 65, 69], \\fold, 0.7`],
  ["fm+crush", `\\instrument, \\fm, \\dur, 1/2, \\amp, 0.2, \\midinote, 74, \\ratio, 3.5, \\crush, 0.6`],
];

e.on("ready", async () => {
  e.tempo(128); await wait(1500);
  let bad = 0;
  console.log("voice".padEnd(16), "rms".padStart(8), "peak".padStart(8), "centroid".padStart(9), "  frames");
  for (const [name, args] of VOICES) {
    e.eval(`~d.(\\d6, ${args})`, "d6");
    await wait(2000); frames = []; await wait(4500);
    const n = frames.length, rms = frames.reduce((a, f) => a + f.rms, 0) / Math.max(n, 1);
    const peak = Math.max(...frames.map((f) => f.peak), 1e-9);
    const cen = frames.reduce((a, f) => a + f.centroid, 0) / Math.max(n, 1);
    const nan = frames.some((f) => !Number.isFinite(f.rms) || !Number.isFinite(f.centroid));
    const silent = db(rms) < -70, hot = peak > 3.5;
    if (nan || silent || hot) bad++;
    console.log(name.padEnd(16), db(rms).toFixed(1).padStart(8), db(peak).toFixed(1).padStart(8), Math.round(cen).toString().padStart(9),
      `  ${n}`, nan ? " NaN!" : "", silent ? " SILENT!" : "", hot ? " TOO HOT!" : "");
    e.eval("~hush.(\\d6)", "h"); await wait(700);
  }
  console.log(`\n${bad} voice(s) misbehaved · ${errors.length} engine error(s)`);
  if (errors.length) console.log(errors.slice(0, 6).join("\n"));
  e.stop(); setTimeout(() => process.exit(bad || errors.length ? 1 : 0), 900);
});
e.start(true);
