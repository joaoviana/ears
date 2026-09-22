// Real model smoke test. Generates suggestions from a seed; never boots or writes to the audio engine.
// npx tsx tui/dev/probe-suggestions.ts [dj-id] [rounds]
import { ask } from "../agent.ts";
import { roster } from "../djs.ts";
import { makeBase } from "../seed.ts";
import { musicContext } from "../direction.ts";

const djs = roster(), dj = djs.find(d => d.id === (process.argv[2] || "queen-funty")) ?? djs.find(d => d.id === "resident")!;
const base = makeBase(4821, "vibey", "boogie");
const samples: unknown[] = [];
for (let round = 0; round < Math.min(4, Number(process.argv[3] || 1)); round++) {
  const events: unknown[] = [], options: unknown[] = [];
  let error: string | undefined;
  await ask({ dj, round, slots: base.slots, context: musicContext(base.bpm, base),
    // Deliberately adversarial correction brief: creative lanes should still make music.
    report: "Synthetic probe report: THE BIGGEST PROBLEM: hats too loud, air +6 dB. Then: lead too bright.",
    note: "Make this a fun algorave showcase: distinct, adventurous patterns. Keep a danceable anchor.", history: [],
    aim: { groove: "d3", hook: "d5", turn: "d6" }, skills: dj.skills,
  }, o => options.push(o), (kind, detail) => events.push({ kind, ...detail })).catch(e => { error = String(e.message); });
  samples.push({ round, options, events, ...(error ? { error } : {}) });
}
console.log(JSON.stringify({ at: new Date().toISOString(), dj: dj.id, audioAuditioned: false, syntheticReport: true, base, samples }, null, 2));
