// Plays the full reference brief, muted, for 8 bars and saves what the ears measured as refs/detroit.json.
import fs from "fs"; import path from "path";
import { Engine, ROOT } from "./engine.ts"; import { Listener } from "./report.ts";
const e = new Engine(), l = new Listener(); let bars = 0;
const REFSET = [
  `~d.(\\r1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)`,
  `~d.(\\r2, \\instrument, \\clap, \\dur, 1, \\amp, Pseq([Rest(0), 0.5], inf))`,
  `~d.(\\r3, \\instrument, \\hat, \\dur, 1/4, \\amp, Pseq([0.1, 0.15, 0.28, 0.15], inf))`,
  `~d.(\\r4, \\instrument, \\hat, \\dur, 1/2, \\dec, 0.16, \\hp, 7000, \\amp, Pseq([Rest(0), 0.12], inf))`,
  `~d.(\\r5, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([29, 29, \\r, 29, 29, \\r, \\r, 32, 29, 29, 29, \\r, \\r, 36, 39, \\r], inf), \\cutoff, 600)`,
  `~d.(\\r6, \\instrument, \\stab, \\dur, Pseq([1, 2.5, 0.5], inf), \\amp, Pseq([Rest(0), 0.16, 0.16], inf), \\midinote, Pdup(6, Pseq([[53, 56, 60, 63, 67], [49, 53, 56, 60, 63]], inf)), \\cutoff, 1700)`,
];
e.on("ready", () => REFSET.forEach((c, i) => e.eval(c, "r" + i)));
e.on("ears", (f) => bars >= 2 && l.push(f));
e.on("onset", () => bars >= 2 && l.onset());
e.on("bar", () => { bars++; if (bars > 2) l.bar(); if (bars === 11) { const p = l.take(); fs.mkdirSync(path.join(ROOT, "tui/refs"), { recursive: true }); fs.writeFileSync(path.join(ROOT, "tui/refs/detroit.json"), JSON.stringify(p, null, 2)); console.log(p); e.stop(); setTimeout(() => process.exit(0), 300); } });
e.start(true);
