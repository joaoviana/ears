// Local recipe generation only; no engine or model calls.
import { instantVariations } from "../instant.ts";
import { makeBase } from "../seed.ts";
import { roster } from "../djs.ts";
const dj = roster()[0], times: number[] = []; let count = 0;
for (let n = 0; n < 500; n++) {
  const slots = makeBase(n).slots, start = performance.now();
  count += instantVariations({ dj, slots, context: "", report: "", note: "", history: [], round: n }).length;
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ runs: 500, options: count, medianMs: times[250], p95Ms: times[475], maxMs: times[499] }));
