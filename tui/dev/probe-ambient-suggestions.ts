// Real CLI smoke test: two local gestures should arrive at 0ms, one Sonnet idea within the live deadline.
import { fastRound } from "../fast-round.ts";
import { roster } from "../djs.ts";
import { makeBase } from "../seed.ts";
import { musicContext } from "../direction.ts";

const dj = roster().find(candidate => candidate.id === "resident")!;
const base = makeBase(260921, "vibey", "ambient"), started = Date.now();
const options: unknown[] = [], events: unknown[] = [];
await fastRound([{ dj, round: 0, slots: base.slots, context: musicContext(base.bpm, base), report: "", note: "", history: [], skills: dj.skills }],
  (option, agent) => options.push({ at_ms: Date.now() - started, agent, option }),
  (kind, detail) => events.push({ at_ms: Date.now() - started, kind, ...detail }));
console.log(JSON.stringify({ model: process.env.EARS_MODEL || "sonnet", elapsed_ms: Date.now() - started, options, events }, null, 2));
