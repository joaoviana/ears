// Plays the reference mix, muted, for 8 bars and saves what the ears measured as refs/house.json.
// It has to be built from the palette the set actually plays: while this was six synth voices and the rotation had
// moved to the sampled kit, every report read +26 dB air and +290 Hz bright, and the DJs chased a brightness
// problem that did not exist. Re-run it (npm run ears:ref) whenever the kit or the master chain changes.
import fs from "fs"; import path from "path";
import { Engine, ROOT } from "./engine.ts"; import { Listener } from "./report.ts";
const e = new Engine(), l = new Listener(); let bars = 0;
const REFSET = [
  // This has to look like a base the rotation actually rolls, or every report reads as a deviation that is really a
  // mismatch. Two things matter most: the ROOT must sit where seed.ts puts it (midi 26-37, so the sub band <80 Hz is
  // genuinely occupied - a reference bass at 29 is ~87 Hz and leaves sub empty, which makes every live base "boomy"),
  // and the kick must be the sampled one with the same dec/hp/send that seed.ts writes.
  `~d.(\\r1, \\instrument, \\smp, \\buf, ~k.(\\kick), \\dur, 1/4, \\amp, ~x.("X---X---X---X---", 0.8), \\dec, 0.42, \\hp, 28, \\send, 0.04)`,
  `~d.(\\r2, \\instrument, \\smp, \\buf, ~k.(\\clap), \\dur, 1/4, \\amp, ~x.("----X-------X---", 0.55), \\pan, 0.04, \\send, 0.45)`,
  `~d.(\\r3, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.("hhHhhhHhhhHhhhHh"), \\amp, ~x.("x-Xxx-Xxx-Xxx-Xx", 0.34), \\dec, Pseq([0.05, 0.04, 0.2, 0.04], inf), \\send, 0.1)`,
  `~d.(\\r4, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.("--s-C--s-s--C-t-"), \\amp, ~x.("--x-X--x-x--X-x-", 0.5), \\send, 0.45)`,
  `~d.(\\r5, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([31, \\r, 43, 31, \\r, 43, \\r, 31, 31, \\r, 43, \\r, 38, \\r, 43, \\r], inf), \\cutoff, 700, \\res, 2, \\dec, 0.16, \\duck, 0.4, \\amp, 0.8)`,
  `~d.(\\r6, \\instrument, \\keys, \\dur, 1/4, \\midinote, Pseq([[55, 59, 66, 69], [60, 64, 71, 74]], inf).stutter(16), \\buf, ~kf, \\rootfreq, ~kr, \\amp, ~x.("--X-X--X--X-X--X", 0.42), \\dec, 0.4, \\rel, 0.2, \\send, 0.4)`,
];
e.on("ready", () => REFSET.forEach((c, i) => e.eval(c, "r" + i)));
e.on("ears", (f) => bars >= 2 && l.push(f));
e.on("onset", () => bars >= 2 && l.onset());
e.on("bar", () => { bars++; if (bars > 2) l.bar(); if (bars === 11) { const p = l.take(); fs.mkdirSync(path.join(ROOT, "tui/refs"), { recursive: true }); fs.writeFileSync(path.join(ROOT, "tui/refs/house.json"), JSON.stringify(p, null, 2)); console.log(p); e.stop(); setTimeout(() => process.exit(0), 300); } });
e.start(true);
