// Prints one frame of every look, so they can be checked without booting the engine.  tsx tui/preview.ts [w] [h]
import { render, LOOKS } from "./ascii.ts"; import { fake } from "./audio.ts"; fake(1.2, 0.8); fake(1.25, 0.6);
const w = Number(process.argv[2] || 120), h = Number(process.argv[3] || 22);
const s = { kick: 0.6, snare: 0.3, hat: 0.5, stab: 0.4, bar: 0.3, barN: 9, bands: [0.33, 0.16, 0.09, 0.05, 0.025] };
const only = process.argv[4];
for (const look of LOOKS) {
  if (only && look !== only) continue;
  const t0 = performance.now(); let rows: string[] = [];
  for (let i = 0; i < 10; i++) rows = render({ look, palette: "ember" }, null, 0, look === "waterfall" ? "blocks" : "ascii", w, h, 3 + i * 0.07, { ...s, kick: i === 3 ? 1 : s.kick * 0.8, snare: i === 2 ? 1 : 0.2 }, { code: "~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9) ~d.(\\d3, \\instrument, \\bass, \\cutoff, 3800)" });
  console.log(`\n\x1b[1m${look}\x1b[0m  ${((performance.now() - t0) / 10).toFixed(1)} ms/frame`);
  console.log(rows.join("\n"));
}
