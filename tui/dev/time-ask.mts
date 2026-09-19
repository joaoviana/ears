import fs from "fs"; import { ask } from "../agent.ts"; import { roster } from "../djs.ts"; import { makeBase } from "../seed.ts";
const b = makeBase(Number(process.argv[3] || 33)), dj = roster().find((d) => d.id === (process.argv[2] || "detroit-130"))!;
const report = `vs reference "detroit"\nsub  <80Hz     -7.4 dB   -5.0  thin\nlow  150Hz     -9.7 dB   -1.0  ok\nmid  700Hz    -11.9 dB   +1.7  ok\nhigh 3kHz     -20.1 dB   -1.0  ok\nair  >7kHz    -25.8 dB   -4.0  closed\ncentroid        2.8 kHz  -42.7%  dark\nonsets/beat     1.4      +0.4  ok\nloudness       -9.9 dB   -2.6  quiet`;
const t = Date.now();
await ask({ dj, context: `${b.bpm} BPM, key ${b.key} (bass root midinote ${b.root})`, slots: b.slots, report, note: "", history: [] },
  (o) => console.log(`\n+${((Date.now() - t) / 1000).toFixed(1)}s  [${o.angle}] ${o.slot}  ${o.why}\n        ${o.diff}\n        ${o.code.slice(0, 150)}`),
  (k, d) => k === "rejected" && console.log("rejected", d)).catch((e) => console.log("ERR", e.message));
console.log(`\nall in after ${((Date.now() - t) / 1000).toFixed(1)}s`);
