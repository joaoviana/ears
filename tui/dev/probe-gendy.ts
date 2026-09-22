// Does \gendy actually make a sound, at both ends of knum? Muted second engine, per-slot taps.
//   EARS_PORT=57430 EARS_SC_PORT=57261 npx tsx tui/dev/probe-gendy.ts
import { Engine } from "../engine.ts";
const e = new Engine(); const taps: Record<string, number[]> = {};
e.on("slotears", (f: any) => (taps[f.slot] ??= []).push(f.rms ?? f.mid ?? 0));
e.on("log", (l: string) => /ERROR|FAILURE|Exception/.test(l) && console.log("[sc]", l.slice(0, 140)));
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
e.on("ready", async () => {
  e.tempo(126);
  // low knum: rough, vocal, grit bass.  high knum: smoother, a lead that still will not sit still.
  e.eval(`~d.(\\d1, \\instrument, \\gendy, \\dur, 1/4, \\midinote, Pseq([40, \\r, 52, \\r, 40, \\r, 47, \\r], inf), \\amp, ~x.("X-x-X--x-X-x--X-", 0.5), \\knum, 5, \\chaos, 0.7, \\cutoff, 2200, \\dec, 0.22)`, "g1");
  e.eval(`~d.(\\d2, \\instrument, \\gendy, \\dur, 1/4, \\midinote, Pseq([76, 83, 79, 88], inf), \\amp, ~x.("--X---X---X---X-", 0.3), \\knum, 24, \\chaos, 0.25, \\scale, 0.2, \\cutoff, 6000, \\dec, 0.35)`, "g2");
  await new Promise((r) => setTimeout(r, 9000));
  for (const [k, label] of [["d1", "knum 5  grit bass"], ["d2", "knum 24 lead"]]) {
    const v = taps[k] || [], mean = v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);
    console.log(`${label.padEnd(20)} ${String(v.length).padStart(4)} frames  ${db(mean).toFixed(1).padStart(7)} dBFS  ${db(mean) > -70 ? "SOUNDING" : "SILENT"}`);
  }
  e.stop(); setTimeout(() => process.exit(0), 600);
});
e.start(true);
