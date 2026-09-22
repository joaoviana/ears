// The set, after the fact. `npm run ears:why` answers "where did the time go"; this answers the question a demo
// audience actually asks — what did the DJ change, why did it think that would help, and did it?
//
//   npm run ears:recap                    the session that is running or last ran
//   npm run ears:recap -- <file>          a particular log
//   npm run ears:recap -- <file> out.html somewhere other than tui/logs/recap.html
//
// Everything here is already on the wire. Nothing is inferred, and nothing is claimed that the protocol does not
// claim: a called shot that measured in the right direction is reported as a hit against the master mix, with the
// same confounds the outcome event carries. This is a record of a live set, not a controlled experiment.
import fs from "fs"; import path from "path"; import { ROOT } from "./engine.ts";

const file = process.argv[2] || path.join(process.env.EARS_LOG_DIR || path.join(ROOT, "tui/logs"), "latest.jsonl");
if (!fs.existsSync(file)) { console.error(`no log at ${file}`); process.exit(1); }
const msgs = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
if (!msgs.length) { console.error("log is empty"); process.exit(1); }

const s = (x: unknown) => String(x ?? "");
const esc = (x: unknown) => s(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const t0 = msgs[0].t;
const clock = (t: number) => { const x = Math.max(0, Math.round((t - t0) / 1000)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; };

interface Param { key: string; before: string; after: string }
interface Move {
  t: number; bar: number; dj: string; slots: string; why: string; evidence: string; angle: string;
  call: string; diff: string; params: Param[]; ms: number;
  decision?: string; by?: string; grade?: string; delta?: number; unit?: string; confounds: string[];
}

// One entry per proposal, then folded together with the verdict that answered it and the outcome that graded it.
const proposals = new Map<number, Move>();
const order: number[] = [];
const enters: { t: number; name: string; remote: boolean }[] = [];
const unlocks: { t: number; what: string }[] = [];
const refusals = new Map<string, number>();
const applies: any[] = [];
let ended: number | null = null;

for (const m of msgs) {
  switch (m.type) {
    case "proposal": {
      if (m.id == null) break;
      proposals.set(m.id, {
        t: m.t, bar: Number(m.bar) || 0, dj: s(m.from), angle: s(m.angle),
        slots: (m.slots?.length ? m.slots : [m.slot]).filter(Boolean).join("+"),
        why: s(m.why), evidence: s(m.evidence), call: s(m.expected_change) || describeExpect(m.expect),
        diff: s(m.diff), params: [], ms: Number(m.ms) || 0, confounds: [],
      });
      order.push(m.id);
      break;
    }
    case "verdict": {
      const p = proposals.get(m.proposal);
      if (p) { p.decision = s(m.decision); p.by = s(m.by); }
      break;
    }
    // `applied` is keyed by execution, not by proposal, so it has to be matched back by slot and time. Deferred to
    // a second pass: a proposal is only a candidate once its verdict is known, and the verdict can arrive after.
    case "applied": applies.push(m); break;
    case "outcome": {
      const p = proposals.get(m.proposal);
      if (p) { p.grade = s(m.grade); p.delta = Number(m.delta); p.unit = s(m.unit); p.confounds = m.confounds ?? []; }
      break;
    }
    case "rejected": refusals.set(s(m.reason), (refusals.get(s(m.reason)) ?? 0) + 1); break;
    case "enter": enters.push({ t: m.t, name: s(m.name) || s(m.agent), remote: !!m.remote }); break;
    case "unlock": unlocks.push({ t: m.t, what: s(m.skill) || s(m.name) || s(m.what) }); break;
    case "session_end": ended = m.t; break;
  }
}

function describeExpect(e: any) { return e?.metric ? `${e.metric} ${e.dir === "up" ? "↑" : "↓"}` : ""; }

// Second pass. An applied edit belongs to the most recent TAKEN proposal for that slot that does not have one yet:
// a proposal the performer passed over never reached the engine, so it must not be shown carrying a diff. Seed and
// performer edits also arrive as `applied` with no proposal behind them at all, and are left unmatched on purpose.
for (const m of applies) {
  const params: Param[] = m.source_diff?.parameters ?? [];
  if (!params.length) continue;
  for (let i = order.length - 1; i >= 0; i--) {
    const p = proposals.get(order[i])!;
    if (p.decision !== "take" || p.params.length || p.t > m.t) continue;
    if (p.slots.split("+").includes(s(m.slot))) { p.params = params; break; }
  }
}

const moves = order.map((id) => proposals.get(id)!).filter(Boolean);
const taken = moves.filter((m) => m.decision === "take");
const graded = taken.filter((m) => m.grade && m.grade !== "ungraded");
const hits = graded.filter((m) => m.grade === "hit");
const minutes = ((ended ?? msgs[msgs.length - 1].t) - t0) / 60000;

// Which DJ did what. A booth with one resident should not get a table of one row, so this is rendered only when
// more than one DJ actually proposed something.
const byDj = new Map<string, { offered: number; taken: number; hit: number }>();
for (const m of moves) {
  const r = byDj.get(m.dj) ?? { offered: 0, taken: 0, hit: 0 };
  r.offered++; if (m.decision === "take") r.taken++; if (m.grade === "hit") r.hit++;
  byDj.set(m.dj, r);
}

const GRADE: Record<string, { mark: string; cls: string; text: string }> = {
  hit: { mark: "●", cls: "hit", text: "moved the way it said" },
  miss: { mark: "✗", cls: "miss", text: "moved the other way" },
  flat: { mark: "○", cls: "flat", text: "did not move outside the noise" },
};

const card = (m: Move) => {
  const g = m.grade ? GRADE[m.grade] : undefined;
  const params = m.params.length
    ? `<dl class="diff">${m.params.map((p) => `<dt>${esc(p.key)}</dt><dd><s>${esc(p.before)}</s> <b>${esc(p.after)}</b></dd>`).join("")}</dl>`
    : m.diff ? `<p class="diff plain">${esc(m.diff)}</p>` : "";
  return `<article class="move ${m.decision === "take" ? "took" : "passed"}">
  <header><span class="at">${clock(m.t)}</span><span class="dj">${esc(m.dj)}</span><span class="slots">${esc(m.slots)}</span>
    <span class="verdict ${m.decision === "take" ? "took" : "passed"}">${m.decision === "take" ? "taken" : m.decision ? esc(m.decision) : "not answered"}</span></header>
  <p class="why">${esc(m.why)}</p>
  ${m.evidence ? `<p class="because"><span>because</span> ${esc(m.evidence)}</p>` : ""}
  ${params}
  ${m.call ? `<p class="called"><span>called</span> ${esc(m.call)}${g ? ` <b class="${g.cls}">${g.mark} ${esc(m.grade)}</b> <span class="measured">${m.delta == null ? "" : `${m.delta > 0 ? "+" : ""}${m.delta.toFixed(1)}${esc(m.unit)} — ${g.text}`}</span>` : m.decision === "take" ? ` <span class="measured">not graded</span>` : ""}</p>` : ""}
</article>`;
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(path.basename(file).replace(/\.jsonl$/, ""))} — the set</title>
<style>
  :root { --bg:#0b0a09; --fg:#e8e2d9; --dim:#8a8378; --faint:#514c45; --line:#231f1c; --a:#c9a227; --b:#b5563a; --ok:#7fa650; }
  * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif; }
  .wrap { max-width:56rem; margin:0 auto; padding:3rem 1rem 6rem; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; font-weight:600; letter-spacing:-.01em }
  .sub { color:var(--dim); margin:0 0 2.5rem; font-size:.9rem }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(9rem,1fr)); gap:.75rem; margin:0 0 2.5rem }
  .tile { border:1px solid var(--line); border-radius:.5rem; padding:.85rem 1rem }
  .tile b { display:block; font-size:1.6rem; font-weight:600; line-height:1.15; font-variant-numeric:tabular-nums }
  .tile span { color:var(--dim); font-size:.78rem; text-transform:uppercase; letter-spacing:.06em }
  h2 { font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:2.5rem 0 .9rem; font-weight:600 }
  .move { border-left:2px solid var(--line); padding:0 0 1.4rem 1.1rem; margin:0 }
  .move.took { border-left-color:var(--a) }
  .move header { display:flex; flex-wrap:wrap; gap:.55rem; align-items:baseline; font-size:.8rem; margin-bottom:.35rem }
  .at { color:var(--faint); font-variant-numeric:tabular-nums }
  .dj { color:var(--a); font-weight:600; text-transform:lowercase }
  .slots { color:var(--dim); font-family:ui-monospace,Menlo,monospace }
  .verdict { margin-left:auto; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--faint) }
  .verdict.took { color:var(--a) }
  .why { margin:0 0 .35rem }
  .because, .called { margin:.2rem 0 0; font-size:.86rem; color:var(--dim) }
  .because span, .called span { color:var(--faint) }
  .diff { margin:.55rem 0 .2rem; font-family:ui-monospace,Menlo,monospace; font-size:.8rem; display:grid; grid-template-columns:auto 1fr; gap:.1rem .7rem }
  .diff dt { color:var(--faint) } .diff dd { margin:0; overflow-wrap:anywhere }
  .diff s { color:var(--faint); text-decoration-color:var(--faint) } .diff b { color:var(--fg); font-weight:500 }
  .diff.plain { display:block; color:var(--dim); overflow-wrap:anywhere }
  .hit { color:var(--ok) } .miss { color:var(--b) } .flat { color:var(--dim) }
  .measured { color:var(--faint) }
  table { border-collapse:collapse; width:100%; font-size:.86rem } td, th { text-align:left; padding:.4rem .6rem .4rem 0; border-bottom:1px solid var(--line) }
  th { color:var(--dim); font-weight:500; font-size:.78rem }
  td.n { font-variant-numeric:tabular-nums; color:var(--dim) }
  footer { margin-top:3rem; padding-top:1.2rem; border-top:1px solid var(--line); color:var(--faint); font-size:.78rem }
  footer li { margin:.25rem 0 } footer ul { padding-left:1.1rem; margin:.4rem 0 }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg:#faf8f5; --fg:#1c1917; --dim:#6b645c; --faint:#a29a90; --line:#e4dfd8; --a:#8a6d1f; --b:#a1442a; --ok:#4f6b32 } }
</style></head><body><div class="wrap">
<h1>${esc(path.basename(file).replace(/\.jsonl$/, ""))}</h1>
<p class="sub">${minutes.toFixed(0)} minutes · ${moves.length} ideas offered · ${taken.length} taken${enters.length ? ` · ${enters.map((e) => esc(e.name.toLowerCase())).join(", ")} in the booth` : ""}</p>

<div class="tiles">
  <div class="tile"><b>${taken.length}</b><span>changes taken</span></div>
  <div class="tile"><b>${moves.length - taken.length}</b><span>passed over</span></div>
  <div class="tile"><b>${graded.length ? `${hits.length}/${graded.length}` : "—"}</b><span>called shots hit</span></div>
  <div class="tile"><b>${minutes > 0 ? (taken.length / minutes).toFixed(1) : "—"}</b><span>changes per minute</span></div>
</div>

${byDj.size > 1 ? `<h2>who proposed what</h2><table><tr><th>DJ</th><th>offered</th><th>taken</th><th>hit</th></tr>${
  [...byDj].sort((a, b) => b[1].taken - a[1].taken).map(([dj, r]) => `<tr><td>${esc(dj)}</td><td class="n">${r.offered}</td><td class="n">${r.taken}</td><td class="n">${r.hit}</td></tr>`).join("")
}</table>` : ""}

<h2>the set, in order</h2>
${moves.length ? moves.map(card).join("\n") : `<p class="sub">No proposals in this log.</p>`}

${refusals.size ? `<h2>refused before it reached you</h2><table>${[...refusals].sort((a, b) => b[1] - a[1]).map(([why, n]) => `<tr><td>${esc(why)}</td><td class="n">${n}×</td></tr>`).join("")}</table>` : ""}

<footer>
  <p><b>What a “hit” means here, and what it does not.</b></p>
  <ul>
    <li>Measured against the live master mix, not an isolated voice.</li>
    <li>Observational: the music kept moving on its own, so this is not causal attribution.</li>
    <li>No controlled A/B render — different musical time, and stochastic patterns and effect tails differ between windows.</li>
    <li>Shared effects and master processing are not isolated from the change.</li>
  </ul>
  <p>Generated from ${esc(path.basename(file))} · every line above is read from the session wire, nothing is reconstructed.</p>
</footer>
</div></body></html>`;

const out = process.argv[3] || path.join(path.dirname(file), "recap.html");
fs.writeFileSync(out, html);
console.log(`${path.basename(file)} · ${moves.length} ideas · ${taken.length} taken · ${graded.length ? `${hits.length}/${graded.length} called shots hit` : "nothing graded"}`);
console.log(out);
