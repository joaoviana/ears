import { ask } from "./agent.ts"; import fs from "fs";
const slots = Object.fromEntries(["d1", "d2", "d3", "d4"].map((k) => [k, fs.readFileSync(`tui/set/${k}.scd`, "utf8")]));
const report = `vs reference "detroit"\nsub  <80Hz      -14.2 dB  -6.1  thin\nlow  150Hz      -9.0 dB  -1.0  ok\nmid  700Hz     -15.0 dB  +4.8  boxy\nhigh 3kHz      -24.1 dB  +5.2  harsh\ncentroid         3.1 kHz  +72.0%  bright\nonsets/beat       3.9  -0.4  ok`;
const t = Date.now();
ask({ slots, report, note: "", history: [] }).then((s) => console.log(((Date.now() - t) / 1000).toFixed(1) + "s", s), (e) => console.log("ERR", e.message));
