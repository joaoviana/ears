// Read the current set and compose alternatives without starting an engine or changing source.
// Optional: --jev-env /path/to/.env reads ONLY JEV_API_KEY, never executes the env file.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { ROOT } from "../engine.ts";
import { SLOTS } from "../session.ts";
import { roster } from "../djs.ts";
import { suggestionRound } from "../suggestion-round.ts";
import { reviewCandidates, type Candidate } from "../jev.ts";
import type { AskInput } from "../agent.ts";

const set = process.env.EARS_SET || path.join(ROOT, "tui/set");
const djs = roster(), dj = djs.find(d => d.id === "resident") ?? djs[0];
const input: AskInput = {
  dj, wild: 2, context: "Tempo and key unknown: infer relationships from the supplied current patterns.",
  slots: Object.fromEntries(SLOTS.map(slot => [slot, fs.readFileSync(path.join(set, slot + ".scd"), "utf8")])),
  report: "No live listening report was collected for this offline probe.",
  note: "Offer a purposeful new musical idea using SuperCollider's available instruments and patterns. Keep one recognisable rhythmic anchor. Avoid generic row rotations, reversing a motif, or merely moving alternate notes up an octave. Make the musical relationship to the current set clear.",
  history: [], skills: dj.skills,
};
const candidates: Candidate[] = [], events: { kind: string; detail: Record<string, unknown> }[] = [];
await suggestionRound([input], (option, agent) => candidates.push({ option, agent }), (kind, detail) => events.push({ kind, detail }), undefined, null);
const arg = process.argv.indexOf("--jev-env");
let review;
if (arg >= 0) {
  const apiKey = parseEnv(fs.readFileSync(process.argv[arg + 1], "utf8")).JEV_API_KEY;
  review = await reviewCandidates(input, candidates, { apiKey });
}
console.log(JSON.stringify({ at: new Date().toISOString(), audioAuditioned: false, sourceChanged: false, context: input.context, note: input.note, slots: input.slots, candidates, events, review }, null, 2));
