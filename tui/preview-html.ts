// Renders every look to an HTML contact sheet, so the colours can be checked outside a terminal.
import fs from "fs"; import { render, LOOKS } from "./ascii.ts"; import { fake } from "./audio.ts"; fake(1.2, 0.8); fake(1.25, 0.6);
const w = 150, h = 34, esc = (c: string) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const s = { kick: 0.7, snare: 0.2, hat: 0.5, stab: 0.4, bar: 0.3, barN: 9, bands: [0.4, 0.18, 0.05, 0.015, 0.002] };
const code = "~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.9) ~d.(\\d3, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([29, 29, \\r, 29], inf), \\cutoff, 3800)";
const only = process.argv[2]?.split(","), pal = process.argv[3] || "ember";
let html = `<meta charset="utf-8"><body style="background:#0b0a09;margin:12px;font:11px/1.15 Menlo,monospace;color:#777">`;
for (const look of LOOKS) {
  if (only && !only.includes(look)) continue;
  let rows: string[] = [];
  for (let i = 0; i < 30; i++) rows = render({ look, palette: pal }, null, 0, "ascii", w, h, 2 + i * 0.066, { ...s, kick: i % 7 === 0 ? 1 : s.kick * Math.exp(-(i % 7) * 0.3), snare: i === 22 ? 1 : 0.3 * Math.exp(-(i - 22) * 0.4) * (i > 22 ? 1 : 0) }, { code });
  html += `<div style="margin:6px 0 2px">${look}</div><pre style="margin:0">` + rows.map((r) => esc(r).replace(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g, `</span><span style="color:rgb($1,$2,$3)">`).replace(/\x1b\[39m/g, "</span>")).join("\n") + "</pre>";
}
fs.writeFileSync(process.argv[4] || "/tmp/looks.html", html);
