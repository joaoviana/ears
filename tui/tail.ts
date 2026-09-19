// npm run ears:tail : follow the live protocol log in another pane or on a second screen.
import fs from "fs"; import path from "path"; import { ROOT } from "./engine.ts"; import { pretty, type Msg } from "./bus.ts";
const file = process.argv[2] || path.join(ROOT, "tui/logs/latest.jsonl");
const C: Record<string, string> = { proposal: "38;2;255;95;210", grant: "38;2;255;95;210", unlock: "38;2;255;95;210", enter: "38;2;255;95;210", verdict: "38;2;198;242;78", rejected: "38;2;255;122;184", error: "38;2;255;122;184", note: "38;2;255;255;255", applied: "38;2;232;230;240", active: "38;2;232;230;240", landed: "38;2;232;230;240", transition: "38;2;199;184;255" };   // neon + acid, no amber/cyan
const show = (line: string) => { try { const m = JSON.parse(line) as Msg; if (m.same && !process.argv.includes("--all")) return; const p = pretty(m); console.log(`\x1b[38;2;90;88;104m${p.time}\x1b[0m  \x1b[${C[p.type] || "0"}m${p.type.padEnd(12)}\x1b[0m \x1b[38;2;138;135;153m${p.from.padEnd(14).slice(0, 14)}\x1b[0m ${p.text}`); } catch {} };
let pos = 0;
const pump = () => { try { const st = fs.statSync(file); if (st.size < pos) pos = 0; if (st.size > pos) { const fd = fs.openSync(file, "r"), buf = Buffer.alloc(st.size - pos); fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd); pos = st.size; buf.toString("utf8").split("\n").filter(Boolean).forEach(show); } } catch {} };
console.log(`\x1b[38;2;138;135;153mfollowing ${file}\x1b[0m`); pump(); setInterval(pump, 150);
