// Second muted engine: render a phrase, load it, eval a vox slot, confirm SuperCollider accepts it and sound comes out.
import { Engine } from "../engine.ts"; import { ensureVox } from "../skills.ts"; import { feed, audio } from "../audio.ts";
const e = new Engine(); let peak = 0;
e.on("log", (l) => console.log("[sc]", l)); e.on("evald", (r) => console.log("evald", r)); e.on("voxd", (k) => console.log("loaded phrase:", k));
let shown = 0; e.on("scope", (d: number[]) => { feed(d); peak = Math.max(peak, audio.level); const mx = Math.max(...d.map(Math.abs)); if (mx > 2 && shown++ < 3) console.log("scope max", mx, "first", d.slice(0, 6)); });
e.on("ears", (f: any) => { if (f.peak > 2 && shown++ < 6) console.log("ears", f.rms, f.peak); });
e.on("ready", async () => { const code = `~d.(\\d4, \\instrument, \\vox, \\dur, 1/2, \\buf, ~v.("work it"), \\chop, Pseq([0, 0, 0.5, 0], inf), \\len, 0.22, \\rate, Pwrand([1, 0.8], [0.8, 0.2], inf), \\amp, ~x.("X-xX--X-", 0.5))`; await ensureVox(e, code, "Fred"); e.eval(code, "d4"); setTimeout(() => { console.log("level while only the vocal plays:", peak.toFixed(4)); e.stop(); setTimeout(() => process.exit(0), 900); }, 6000); });
e.start(true);
