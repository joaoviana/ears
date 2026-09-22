// Where did the time go? Reads the wire log and prints one line per round: when each angle was asked, when it
// answered, what was refused and why. Everything here was already on the wire — there was just no way to read it.
//   npm run ears:why            the session that is running or last ran
//   npm run ears:why -- <file>  a particular log
import fs from "fs"; import path from "path"; import { ROOT } from "./engine.ts";

const file = process.argv[2] || path.join(process.env.EARS_LOG_DIR || path.join(ROOT, "tui/logs"), "latest.jsonl");
if (!fs.existsSync(file)) { console.error(`no log at ${file}`); process.exit(1); }
const msgs = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
if (!msgs.length) { console.error("log is empty"); process.exit(1); }

const t0 = msgs[0].t, at = (t: number) => ((t - t0) / 1000).toFixed(1).padStart(6) + "s";
const s = (x: unknown) => String(x ?? "");
interface Round { asked: number; angles: Map<string, number>; got: { angle: string; ms: number; slots: string; why: string }[]; lost: { angle: string; ms: number; why: string }[]; verdict?: { t: number; decision: string; by: string }; banked?: boolean; pause?: number }

const rounds: Round[] = [];
let cur: Round | null = null;
let previousVerdict: number | null = null;
for (const m of msgs) {
  if (m.type === "proposal") {
    if (!cur || cur.verdict) {
      cur = { asked: m.t, angles: new Map(), got: [], lost: [], ...(previousVerdict == null ? {} : { pause: m.t - previousVerdict }) };
      rounds.push(cur);
    }
    cur.got.push({ angle: s(m.angle) || "banked", ms: Number(m.ms) || 0, slots: (m.slots || [m.slot]).join("+"), why: s(m.why) });
    if (!m.angle) cur.banked = true;
  } else if (m.type === "request") {
    if (!cur || cur.verdict) {
      cur = { asked: m.t, angles: new Map(), got: [], lost: [], ...(previousVerdict == null ? {} : { pause: m.t - previousVerdict }) };
      rounds.push(cur);
    }
    cur.angles.set(s(m.angle), m.t);
  } else if (m.type === "rejected" && cur) {
    cur.lost.push({ angle: s(m.angle) || "?", ms: Number(m.ms) || 0, why: s(m.reason) });
  } else if (m.type === "verdict" && cur && !cur.verdict && m.decision) {
    cur.verdict = { t: m.t, decision: s(m.decision), by: s(m.by) };
    previousVerdict = m.t;
  }
}

console.log(`${path.basename(file)} · ${msgs.length} messages · ${((msgs[msgs.length - 1].t - t0) / 1000 / 60).toFixed(1)} min\n`);
const waits: number[] = [], firsts: number[] = [];
for (const [i, r] of rounds.entries()) {
  const last = r.got.length ? Math.max(...r.got.map((g) => g.ms)) : 0, first = r.got.length ? Math.min(...r.got.map((g) => g.ms)) : 0;
  if (r.got.length) { firsts.push(first); waits.push(last); }
  console.log(`${at(r.asked)}  round ${String(i + 1).padStart(2)}${r.pause == null ? "" : `  listened ${(r.pause / 1000).toFixed(1)}s`}  ${r.got.length} option${r.got.length === 1 ? " " : "s"}` +
    `  first ${(first / 1000).toFixed(1)}s  all in ${(last / 1000).toFixed(1)}s${r.banked ? "  (from the bank)" : ""}`);
  for (const g of r.got.sort((a, b) => a.ms - b.ms)) console.log(`          ${(g.ms / 1000).toFixed(1).padStart(5)}s  ${g.angle.padEnd(9)} ${g.slots.padEnd(7)} ${g.why.slice(0, 64)}`);
  for (const l of r.lost) console.log(`          ${(l.ms / 1000).toFixed(1).padStart(5)}s  ${l.angle.padEnd(9)} refused: ${l.why.slice(0, 66)}`);
  if (r.verdict) console.log(`          ${((r.verdict.t - r.asked) / 1000).toFixed(1).padStart(5)}s  ${r.verdict.decision} (${r.verdict.by})`);
}

const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] / 1000 : 0);
const worst = (xs: number[]) => (xs.length ? Math.max(...xs) / 1000 : 0);
console.log(`\n${rounds.length} rounds · first option: median ${med(firsts).toFixed(1)}s, worst ${worst(firsts).toFixed(1)}s` +
  ` · all options in: median ${med(waits).toFixed(1)}s, worst ${worst(waits).toFixed(1)}s`);
const refusals = rounds.flatMap((r) => r.lost.map((l) => l.why.replace(/d[1-6]/g, "dN").slice(0, 44)));
if (refusals.length) {
  console.log(`\n${refusals.length} refusals:`);
  for (const [why, n] of [...refusals.reduce((m2, w) => m2.set(w, (m2.get(w) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}×  ${why}`);
}
const ungraded = msgs.filter((m) => m.type === "outcome" && m.grade === "ungraded").length, graded = msgs.filter((m) => m.type === "outcome").length;
if (graded) console.log(`\ncalled shots: ${graded - ungraded} of ${graded} actually graded`);
const learning = msgs.filter((m) => m.type === "learning");
if (learning.length) {
  const latest = new Map<string, any>(); for (const m of learning) latest.set(`${m.from}:${m.recipe}`, m);
  console.log(`\nambient learning: ${learning.length} signals`);
  for (const m of [...latest.values()].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 10))
    console.log(`  ${s(m.from).padEnd(16)} ${s(m.recipe).replace(/^ambient-/, "").padEnd(18)} score ${Number(m.score).toFixed(3)} · ${m.takes} take/${m.skips} skip · ${m.hit} hit/${m.miss} miss/${m.flat} flat`);
}

// A take is musically real once SuperCollider reports the first event from the replacement Pdef. This is separate
// from composition time: it measures the visible submitted -> queued -> speakers path.
const taken = msgs.filter((m) => m.type === "applied" && m.proposal != null);
if (taken.length) {
  const activeByExecution = new Map(msgs.filter((m) => m.type === "active").map((m) => [m.execution_id, m]));
  const failedExecutions = new Set(msgs.filter((m) => m.type === "error").map((m) => m.execution_id));
  const failedTakes = taken.filter((m) => failedExecutions.has(m.execution_id));
  const landed = taken.flatMap((m) => {
    const active = activeByExecution.get(m.execution_id);
    return active ? [Math.max(0, Number(active.active_at_ms ?? active.t) - Number(m.t))] : [];
  });
  console.log(`\nspeaker receipts: ${landed.length}/${taken.length} takes active` +
    (landed.length ? ` · median ${med(landed).toFixed(1)}s · worst ${worst(landed).toFixed(1)}s` : "") +
    (failedTakes.length ? ` · ${failedTakes.length} refused by engine` : ""));
  const pending = taken.filter((m) => !activeByExecution.has(m.execution_id) && !failedExecutions.has(m.execution_id));
  if (pending.length) console.log(`  ${pending.length} ended before an active receipt`);
}
