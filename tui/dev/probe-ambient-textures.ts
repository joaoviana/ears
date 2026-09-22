import path from "node:path";
import { Engine, ROOT, type EngineEvents } from "../engine.ts";
import { makeBase } from "../seed.ts";
import { AMBIENT_ARSENAL } from "../ambient-arsenal.ts";

// Never inherit the live TUI's ports: this probe must not attach to or stop the performance the user is hearing.
process.env.EARS_PORT = process.env.EARS_PORT || "57323";
process.env.EARS_SC_PORT = process.env.EARS_SC_PORT || "57201";

const engine = new Engine();
engine.on("log", message => console.error(`[engine] ${message}`));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const onceWhere = <K extends keyof EngineEvents>(event: K, accept: (...args: EngineEvents[K]) => boolean, timeout = 30000) =>
  new Promise<EngineEvents[K]>((resolve, reject) => {
    const done = (...args: EngineEvents[K]) => { if (!accept(...args)) return; cleanup(); resolve(args); };
    const cleanup = () => { clearTimeout(timer); engine.off(event, done as never); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${String(event)} timed out`)); }, timeout);
    engine.on(event, done as never);
  });

async function land(code: string, slot: string, label: string) {
  const execution = `${label}-${Date.now()}`;
  const evaluated = onceWhere("evald", receipt => receipt.execution_id === execution);
  const active = onceWhere("active", receipt => receipt.execution_id === execution);
  engine.eval(code, slot, execution);
  const [receipt] = await evaluated;
  if (!receipt.ok) throw new Error(`${label}: ${receipt.msg}`);
  await active;
}

try {
  const ready = onceWhere("ready", () => true);
  await engine.start(true); await ready;
  const base = makeBase(260921, "vibey", "ambient");
  engine.tempo(base.bpm);
  await Promise.all(Object.entries(base.slots).map(([slot, code]) => land(code, slot, `base-${slot}`)));
  await wait(4000);

  const result: Record<string, unknown> = {};
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["air-flutter", "understone", "brush-burst", "bird-grain", "paper-fall"];
  for (const id of ids) {
    const texture = AMBIENT_ARSENAL.find(seed => seed.id === id)!;
    const levels: number[] = [];
    const meter = (frame: EngineEvents["slotears"][0]) => { if (frame.slot === texture.slot) levels.push(frame.rms); };
    engine.on("slotears", meter);
    await land(texture.code, texture.slot, id);
    await wait(10000);
    const file = path.join(ROOT, `docs/ambient-${id}.wav`);
    const clip = await engine.captureClip(file, 8);
    engine.off("slotears", meter);
    result[id] = { file, frames: clip.frames, slot: texture.slot, meter_frames: levels.length,
      peak_rms: Math.max(...levels), mean_rms: levels.reduce((sum, level) => sum + level, 0) / levels.length };
    await land(base.slots[texture.slot], texture.slot, `restore-${texture.slot}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally { engine.stop(); }
