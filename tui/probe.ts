// Boots a second, muted engine on spare ports and reports what actually arrives. Safe to run while a set is playing.
//   EARS_PORT=57300 EARS_SC_PORT=57190 npx tsx tui/probe.ts
import { Engine } from "./engine.ts"; import { feed, audio } from "./audio.ts";
const e = new Engine(); let scopes = 0, len = 0, bars = 0;
e.on("ready", () => { e.eval("~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9)", "d1"); e.eval("~d.(\\d3, \\instrument, \\bass, \\dur, 1/4, \\midinote, 29, \\cutoff, 900)", "d3"); });
e.on("scope", (d: number[]) => { scopes++; len = d.length; feed(d); });
e.on("log", (l) => console.log("[sc]", l));
e.on("bar", () => { if (++bars === 5) { const peak = Math.max(...audio.mono.map(Math.abs)); console.log({ scopeMessages: scopes, valuesPerMessage: len, level: +audio.level.toFixed(4), peak: +peak.toFixed(3), spectrum: Array.from(audio.spec).map((v) => Math.round(v * 9)).join("") }); e.stop(); setTimeout(() => process.exit(0), 900); } });
e.start(true);
