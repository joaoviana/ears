import { Engine } from "../engine.ts";
const e = new Engine(); let bars = 0, ears = 0, slot = 0, hits = 0;
e.on("log", (l) => console.log("[sc]", l.slice(0, 200)));
e.on("ready", () => { console.log("ready, sample rate", e.sampleRate); e.eval(`~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)`, "d1"); });
e.on("bar", () => bars++); e.on("ears", () => ears++); e.on("slotears", () => slot++); e.on("hit", () => hits++);
e.on("evald", (r) => console.log("evald", r));
setTimeout(() => { console.log({ bars, ears, slot, hits }); e.stop(); setTimeout(() => process.exit(0), 900); }, 14000);
e.start(true);
