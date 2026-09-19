// Second muted engine: fire each transition and confirm the drop comes back on time with no SC errors.
import { Engine } from "./engine.ts";
const e = new Engine(); const t0 = Date.now(); let sentAt = 0; const kinds = ["build", "wash", "riser"] as const; let k = 0;
e.on("log", (l) => console.log("[sc]", l));
e.on("dropped", (kind) => { console.log(kind, "dropped after", ((Date.now() - sentAt) / 1000).toFixed(2), "s"); k++; if (k < 3) { sentAt = Date.now(); e.transition(kinds[k], 2); } else { e.stop(); setTimeout(() => process.exit(0), 900); } });
e.on("ready", () => { e.eval("~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)", "d1"); setTimeout(() => { sentAt = Date.now(); e.transition("build", 2); }, 2500); });
e.start(true);
setTimeout(() => { console.log("timeout"); e.stop(); setTimeout(() => process.exit(1), 900); }, 40000);
