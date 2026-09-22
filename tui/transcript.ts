// The session as a readable transcript: what the sidebar said, what was taken, what the meter found, with the timing
// between them. Reads a wire log (default: the latest) and prints text, or CSV with --csv, so a demo can be read back
// and its timing argued about with numbers.
//   npm run ears:transcript [-- path/to/session.jsonl] [--csv] [--out file]
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./engine.ts";
import { pretty, type Msg } from "./bus.ts";

const args = process.argv.slice(2), csv = args.includes("--csv"), outAt = args.indexOf("--out");
const file = args.find((a) => a.endsWith(".jsonl")) ?? path.join(ROOT, "tui/logs/latest.jsonl");
const rows: Msg[] = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const t0 = rows[0]?.t ?? 0, s = (x: unknown) => String(x ?? "");
const KEEP = new Set(["script", "verdict", "applied", "active", "comparison", "outcome", "rejected", "enter", "leave", "note", "unlock", "grant", "proposal", "round_start"]);
const lines: { at: number; type: string; who: string; text: string }[] = [];
for (const m of rows) {
  if (!KEEP.has(m.type)) continue;
  if (m.type === "verdict" && m.by === "host") continue;
  const at = (m.t - t0) / 1000;
  if (m.type === "script") { lines.push({ at, type: "SAY", who: s(m.title), text: [s(m.live), ...((m.say as string[]) ?? []).map((l) => l.replace(/^\[\w+\] /, ""))].join(" | ") }); continue; }
  if (m.type === "outcome") { lines.push({ at, type: "CHECK", who: s(m.agent), text: `${s((m.expected as { metric?: string })?.metric)} ${s((m.expected as { dir?: string })?.dir)} → ${s(m.grade).toUpperCase()}${m.reason ? ` (${s(m.reason)})` : m.measured ? ` (${s(m.measured)})` : ""}` }); continue; }
  if (m.type === "comparison") { lines.push({ at, type: "compare", who: s(m.slot), text: `${s(m.status)}${(m.confounds as string[] ?? []).filter((c) => /superseded|other state|no stable|early|mixer/.test(c)).map((c) => ` · ${c}`).join("")}` }); continue; }
  const p = pretty(m); lines.push({ at, type: m.type, who: p.from, text: p.text });
}
const fmt = (n: number) => n.toFixed(1).padStart(7);
const out = csv
  ? ["seconds,type,who,text", ...lines.map((l) => [l.at.toFixed(1), l.type, l.who, `"${l.text.replace(/"/g, '""')}"`].join(","))].join("\n")
  : lines.map((l, i) => `${fmt(l.at)}${i ? ` (+${(l.at - lines[i - 1].at).toFixed(1)})`.padEnd(9) : "".padEnd(9)} ${l.type.padEnd(9)} ${l.who.padEnd(14)} ${l.text}`).join("\n");
if (outAt >= 0 && args[outAt + 1]) { fs.writeFileSync(args[outAt + 1], out + "\n"); console.log(`wrote ${args[outAt + 1]} (${lines.length} lines from ${path.basename(file)})`); } else console.log(out);
