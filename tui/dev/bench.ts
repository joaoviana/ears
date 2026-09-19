// Does the protocol help? A headless benchmark on a second, muted engine: same seeds, same DJ, three conditions.
//   A blind       the DJ sees the code only
//   B ears        code + listening report (the v0 protocol)
//   C ears+shots  B, plus its own graded record fed back into the next prompt
// Every idea must call its shot in all three, so every idea can be graded. One idea per round (the "fix" angle),
// auto-taken. Measures: called-shot hit rate, how fast the mix converges on the reference (count of off-words in
// the report), seconds per idea, wasted (flat) changes, refusals.
//   EARS_PORT=57300 EARS_SC_PORT=57190 npx tsx tui/dev/bench.ts [seeds=2] [rounds=6]
import fs from "fs"; import path from "path";
import { Engine, ROOT } from "../engine.ts"; import { Listener, compare, asText, metricDelta, type Profile } from "../report.ts";
import { ask, type Past, type Suggestion } from "../agent.ts"; import { roster } from "../djs.ts"; import { makeBase } from "../seed.ts";
import { NoiseFloor, grade, forPrompt, METRICS, type Metric } from "../shots.ts";
process.env.EARS_ANGLES = "1";
const N_SEEDS = Number(process.argv[2] || 2), ROUNDS = Number(process.argv[3] || 6), SEEDS = [41, 7, 77, 12, 33, 5, 21, 64].slice(0, N_SEEDS);
const CONDS = ["blind", "ears", "ears+shots"] as const;
const ref: Profile = JSON.parse(fs.readFileSync(path.join(ROOT, "tui/refs/detroit.json"), "utf8")), dj = roster().find((d) => d.id === "resident")!;
const e = new Engine(), wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let listener = new Listener(), barLen = 1846, barWaiters: (() => void)[] = [];
e.on("ears", (f) => listener.push(f)); e.on("onset", () => listener.onset()); e.on("log", (l) => /ERROR/.test(l) && console.log("   [sc]", l.slice(0, 100)));
e.on("bar", ({ bpm }) => { barLen = (240 / bpm) * 1000; listener.bar(); barWaiters.splice(0).forEach((f) => f()); });
const nextBar = () => new Promise<void>((r) => barWaiters.push(r));
/** a clean window: start on a bar line, listen for two bars */
const window2 = async (): Promise<Profile> => { await nextBar(); listener = new Listener(); await nextBar(); await nextBar(); return listener.take()!; };
const absolute = (p: Profile) => Object.fromEntries(METRICS.map((k, i) => [k, k === "brightness" ? p.centroid : k === "loudness" ? p.rms : k === "density" ? p.onsetsPerBeat : k === "punch" ? p.crest : p.bands[["sub", "low", "mid", "high", "air"].indexOf(k)] - p.rms])) as Record<Metric, number>;
const offWords = (p: Profile) => compare(p, ref).filter((l) => l.word && l.word !== "ok").length;

interface Row { cond: string; seed: number; round: number; ms: number | null; refused: number; call: string; grade: string; delta: number | null; off_before: number; off_after: number; why: string }
const rows: Row[] = [];

e.on("ready", async () => {
  for (const cond of CONDS) for (const seed of SEEDS) {
    const base = makeBase(seed), slots: Record<string, string> = { ...base.slots }, history: Past[] = [], noise = new NoiseFloor();
    e.eval("Pdef.all.do(_.stop); 1", "stop"); e.tempo(base.bpm); await wait(barLen * 1.2);
    for (const [k, code] of Object.entries(slots)) if (code) e.eval(code, k);
    await nextBar(); await nextBar();
    let before = await window2(); const again = await window2();            // two unchanged windows: the noise floor's first samples
    noise.push("base", absolute(before)); noise.push("base", absolute(again)); before = again;
    console.log(`\n${cond} · seed ${seed} · ${base.style} ${base.bpm} · off-words at start: ${offWords(before)}`);
    for (let round = 1; round <= ROUNDS; round++) {
      const report = cond === "blind" ? "NO LISTENING REPORT IS AVAILABLE. You have the code only. Still call your shot." : asText(compare(before, ref), "detroit");
      let got: Suggestion | null = null, refused = 0;
      try { await ask({ dj, skills: [], slots, report, note: "", history: cond === "ears+shots" ? history : history.map((h) => ({ ...h, outcome: undefined })), context: `${base.bpm} BPM, key ${base.key} (bass root midinote ${base.root})` }, (o) => { got ??= o; }, (kind) => { if (kind === "rejected") refused++; }); } catch {}
      const o = got as Suggestion | null;
      if (!o) { rows.push({ cond, seed, round, ms: null, refused, call: "-", grade: "no idea", delta: null, off_before: offWords(before), off_after: offWords(before), why: "" }); console.log(`  r${round}  no usable idea (${refused} refused)`); continue; }
      let ok = true; const onEval = (r: any) => { if (r.id === o.slot && !r.ok) ok = false; }; e.on("evald", onEval);
      e.eval(o.code, o.slot); await nextBar(); await wait(barLen * 0.5); e.off("evald", onEval);
      const after = await window2();
      const out = ok ? grade(o.expect, metricDelta(before, after) as any, noise.floor(o.expect.metric)) : { grade: "engine refused", delta: null, text: "engine refused the code" } as any;
      if (ok) slots[o.slot] = o.code;
      history.push({ slot: o.slot, why: o.why, verdict: "y", id: round, outcome: ok ? forPrompt(o.expect, out) : "the engine refused this code" });
      rows.push({ cond, seed, round, ms: o.ms, refused, call: `${o.expect.metric} ${o.expect.dir}`, grade: out.grade, delta: out.delta, off_before: offWords(before), off_after: offWords(after), why: o.why });
      console.log(`  r${round}  ${(o.ms / 1000).toFixed(1)}s  ${o.slot}  calls ${o.expect.metric} ${o.expect.dir} → ${String(out.grade).toUpperCase().padEnd(8)} ${out.text ?? ""}   off ${offWords(before)}→${offWords(after)}   ${o.why.slice(0, 60)}`);
      before = after;
    }
  }
  // ---- results ----
  const by = (c: string) => rows.filter((r) => r.cond === c), pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + "%" : "-"), mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const table = ["| condition | ideas | HIT | MISS | FLAT | hit rate (of graded) | off-words start → end | s / idea | refusals |", "|---|---|---|---|---|---|---|---|---|",
    ...CONDS.map((c) => { const r = by(c), g = r.filter((x) => ["hit", "miss", "flat"].includes(x.grade)), first = r.filter((x) => x.round === 1), last = r.filter((x) => x.round === ROUNDS);
      return `| ${c} | ${r.filter((x) => x.ms).length} | ${g.filter((x) => x.grade === "hit").length} | ${g.filter((x) => x.grade === "miss").length} | ${g.filter((x) => x.grade === "flat").length} | ${pct(g.filter((x) => x.grade === "hit").length, g.length)} | ${mean(first.map((x) => x.off_before)).toFixed(1)} → ${mean(last.map((x) => x.off_after)).toFixed(1)} | ${(mean(r.filter((x) => x.ms).map((x) => x.ms!)) / 1000).toFixed(1)} | ${r.reduce((a, x) => a + x.refused, 0)} |`; })].join("\n");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"), file = path.join(ROOT, "docs/bench", `${stamp}.md`);
  fs.writeFileSync(file, `# EARS benchmark · ${stamp}\n\n${SEEDS.length} seeds × ${ROUNDS} rounds × ${CONDS.length} conditions, DJ: ${dj.name}, one idea per round (fix angle), auto-taken, muted second engine.\nGrading is observational (live master mix, stochastic patterns), against a per-seed noise floor. Small n: read it as a pilot.\n\n${table}\n\n## Every round\n\n| cond | seed | round | s | call | grade | Δ | off → | why |\n|---|---|---|---|---|---|---|---|---|\n${rows.map((r) => `| ${r.cond} | ${r.seed} | ${r.round} | ${r.ms ? (r.ms / 1000).toFixed(1) : "-"} | ${r.call} | ${r.grade} | ${r.delta == null ? "-" : r.delta.toFixed(1)} | ${r.off_before}→${r.off_after} | ${r.why.replace(/\|/g, "/")} |`).join("\n")}\n`);
  fs.writeFileSync(file.replace(".md", ".json"), JSON.stringify(rows, null, 2));
  console.log(`\n${table}\n\nwritten to ${file}`);
  e.stop(); setTimeout(() => process.exit(0), 900);
});
e.start(true);
