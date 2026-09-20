// Ask a real DJ for real ideas against a seeded base and print what the new MOVE form actually produces:
// how many slots each angle reaches for, and whether it adds or trims.  No engine, no audio.
//   npx tsx tui/dev/try-move.ts [seed] [rounds]
import { ask } from "../agent.ts"; import { parseSlot } from "../patch.ts"; import { roster } from "../djs.ts"; import { makeBase } from "../seed.ts";

const seed = Number(process.argv[2] || 41), rounds = Number(process.argv[3] || 1);
const dj = roster().find((d) => d.id === "resident")!;
const base = makeBase(seed, "vibey");
const LOUD = process.env.TRY_REPORT === "loud";   // the control: a report that begs to be trimmed
const report = LOUD ? `Measured against how this base sounded when it started, worst first.

THE BIGGEST PROBLEM: limiting (headroom -2.7 dB)
Then: fizzy (air, +6.7 off) · bright (centroid, +40.8% off)

WHICH VOICE MOVED (level against how this base sounded when it started; this is where the damage is)
  d2 is +12.5 dB louder than it should be
  d5 is +6.5 dB louder than it should be

A change to air smaller than 2.0 dB cannot be measured and will be graded FLAT. Make a move big enough to see.` : `Measured against how this base sounded when it started, worst first.

THE BIGGEST PROBLEM: quiet (envelope, -3.1 off)
Then: closed (air, -6.4 off) · dark (centroid, -31.0% off)

WHICH VOICE MOVED (level against how this base sounded when it started; this is where the damage is)
  d5 is -9.0 dB quieter than it should be
  d6 is -6.2 dB quieter than it should be

A change to air smaller than 2.0 dB cannot be measured and will be graded FLAT. Make a move big enough to see.`;

console.log(`${base.style} · ${base.bpm} BPM · key ${base.key}\n`);
let slots = 0, ideas = 0, up = 0; const turns: string[] = [];   // the app remembers these across rounds; so must this
for (let r = 0; r < rounds; r++) {
  await ask({ dj, skills: [], slots: base.slots, report, note: "", history: [], turns, context: `${base.bpm} BPM, key ${base.key} (bass root midinote ${base.root})` },
    (o) => {
      ideas++; slots += o.parts.length; if (o.expect.dir === "up") up++;
      if (o.angle === "turn") { const k = Object.fromEntries(parseSlot(o.parts[0].code).map((x) => [x.key, x.value])); turns.push(`${k.instrument ?? "same"} ${k.dur ?? "same"}`); }
      console.log(`${o.angle.padEnd(6)} ${String(o.parts.length)} slot${o.parts.length > 1 ? "s" : ""}  ${(o.expect.metric + " " + o.expect.dir).padEnd(16)} ${o.why}`);
      for (const p of o.parts) console.log(`         ${p.slot}  ${p.diff.slice(0, 120)}`);
    },
    (kind, d) => { if (kind === "rejected") console.log(`rejected (${d.angle}): ${d.reason}`); }).catch((e) => console.log("  " + e.message));
}
console.log(`\n${ideas} ideas · ${(slots / Math.max(ideas, 1)).toFixed(2)} slots per idea · ${up}/${ideas} called a metric UP`);
