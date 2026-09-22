// Do the stochastic / glitch idioms survive ~d's Pdef wrapper? \delta decoupled from \dur, Pexprand, Pseg, nested
// Pseq with repeat counts, fractional midinotes. Checks each one SOUNDS and still reports /hit (visuals + grading).
//   EARS_PORT=57436 EARS_SC_PORT=57267 npx tsx tui/dev/probe-glitch.ts
import { Engine } from "../engine.ts";
const e = new Engine(); const taps: Record<string, number[]> = {}; const hits: Record<string, number> = {};
e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f.rms ?? f.mid ?? 0));
e.on("hit", (h: any) => (hits[h.slot] = (hits[h.slot] ?? 0) + 1));
e.on("log", (l: string) => /ERROR|FAILURE|Exception/.test(l) && console.log("[sc]", l.slice(0, 150)));
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
const CASES: [string, string, string][] = [
  ["d1", "delta<dur overlap", `~d.(\\d1, \\instrument, \\pluck, \\delta, 0.125, \\dur, 0.9, \\midinote, Pseq([52, 59, 64, 67], inf), \\amp, 0.22, \\dec, 0.9)`],
  ["d2", "Pexprand timing",   `~d.(\\d2, \\instrument, \\fm, \\delta, Pexprand(0.02, 0.3, inf), \\dur, 0.1, \\midinote, Prand([72, 76, 79, 84], inf), \\ratio, 3.5, \\index, 4, \\dec, 0.09, \\amp, 0.16)`],
  ["d3", "Pseg sweep",        `~d.(\\d3, \\instrument, \\acid, \\dur, 1/8, \\midinote, 40, \\cutoff, Pseg([200, 2400, 300], 2, repeats: inf), \\res, 0.85, \\env, 2000, \\dec, 0.14, \\amp, 0.3)`],
  ["d4", "nested Pseq counts",`~d.(\\d4, \\instrument, \\perc, \\dur, Pseq([Pseq([0.05, 0.05, 0.1], 5), Pseq([0.25, 0.125], 3)], inf), \\freq, Prand([180, 320, 900], inf), \\dec, 0.08, \\amp, 0.3)`],
  ["d5", "fractional midinote",`~d.(\\d5, \\instrument, \\gendy, \\dur, 1/4, \\midinote, Pseq([60, 60.25, 60.5, 61.75], inf), \\knum, 7, \\chaos, 0.6, \\dec, 0.3, \\amp, 0.25)`],
];
e.on("ready", async () => {
  e.tempo(128); CASES.forEach(([slot, , code]) => e.eval(code, slot));
  await new Promise((r) => setTimeout(r, 10000));
  for (const [slot, label] of CASES) {
    const v = taps[slot] || [], mean = v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);
    const lvl = db(mean);
    console.log(`${label.padEnd(22)} ${lvl.toFixed(1).padStart(7)} dBFS  hits ${String(hits[slot] ?? 0).padStart(4)}  ${lvl > -70 && (hits[slot] ?? 0) > 0 ? "OK" : "\x1b[31mFAIL\x1b[0m"}`);
  }
  e.stop(); setTimeout(() => process.exit(0), 600);
});
e.start(true);
