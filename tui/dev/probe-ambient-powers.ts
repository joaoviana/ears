import { Engine, type EngineEvents } from "../engine.ts";
import { makeBase } from "../seed.ts";
import { ambientSkillArsenal } from "../ambient-arsenal.ts";
import { musicContext } from "../direction.ts";
import { parse } from "../djs.ts";

process.env.EARS_PORT ||= "57441";
process.env.EARS_SC_PORT ||= "57341";

const engine = new Engine();
const frames: EngineEvents["slotears"][0][] = [];
engine.on("slotears", frame => frames.push(frame));
engine.on("log", message => console.error(message));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const onceWhere = <K extends keyof EngineEvents>(event: K, accept: (...args: EngineEvents[K]) => boolean, timeout = 30000) =>
  new Promise<EngineEvents[K]>((resolve, reject) => {
    const done = (...args: EngineEvents[K]) => { if (!accept(...args)) return; cleanup(); resolve(args); };
    const cleanup = () => { clearTimeout(timer); engine.off(event, done as never); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${String(event)} timed out`)); }, timeout);
    engine.on(event, done as never);
  });
async function land(code: string, slot: string, label: string) {
  const startedAt = Date.now();
  const execution = `${label}-${Date.now()}`;
  const evaluated = onceWhere("evald", receipt => receipt.execution_id === execution);
  const active = onceWhere("active", receipt => receipt.execution_id === execution);
  engine.eval(code, slot, execution);
  const [receipt] = await evaluated;
  if (!receipt.ok) throw new Error(`${label}: ${receipt.msg}`);
  await active;
  return Date.now() - startedAt;
}
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);

try {
  const ready = onceWhere("ready", () => true);
  await engine.start(true); await ready;
  const base = makeBase(260921, "vibey", "ambient");
  engine.tempo(base.bpm);
  await Promise.all(Object.entries(base.slots).map(([slot, code]) => land(code, slot, `base-${slot}`)));
  await wait(5000);
  const dj = parse("---\nname: POWER PROBE\n---\n# Style\nAMBIENT DISCIPLINE: material\n# Idioms\n- moving texture\n# Never\n- voices", "power-probe")!;
  const result: Record<string, unknown> = {};
  for (const [round, id] of ["carve", "fracture", "reveal"].entries()) {
    const options = ambientSkillArsenal({ dj, round: round + 1, showcase: id, skills: [id], slots: { ...base.slots },
      context: musicContext(base.bpm, base), report: "", note: "", history: [] });
    const option = options[0];
    if (!option) throw new Error(`${id}: no immediate option`);
    await wait(2500);
    const before = frames.filter(frame => frame.slot === option.slot).slice(-12);
    const landingMs = await land(option.code, option.slot, id); const activeAt = Date.now(); await wait(3500);
    const after = frames.filter(frame => frame.slot === option.slot).slice(-18);
    result[id] = { slot: option.slot, active: true, landing_ms: landingMs, forBars: option.forBars ?? null, transition: option.transition ?? null,
      before_centroid: Math.round(mean(before.map(frame => frame.centroid))), after_centroid: Math.round(mean(after.map(frame => frame.centroid))),
      after_rms: Number(mean(after.map(frame => frame.rms)).toFixed(6)), measured_ms: Date.now() - activeAt };
    await land(base.slots[option.slot], option.slot, `restore-${id}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally { engine.stop(); }
