// Real-engine proof for the opening score. It records the first twenty seconds and reports when each layer's first
// audible event is scheduled, plus four-second master summaries. It never writes tui/set or joins the live engine.
import path from "node:path";
import { Engine, ROOT, type Ears, type EngineEvents } from "../engine.ts";
import { makeBase } from "../seed.ts";

process.env.EARS_PORT ||= "57451";
process.env.EARS_SC_PORT ||= "57351";

const engine = new Engine();
const frames: { at: number; frame: Ears }[] = [], firstHit = new Map<string, number>(), activeAt: number[] = [];
engine.on("ears", frame => frames.push({ at: Date.now(), frame }));
engine.on("hit", hit => { if (!firstHit.has(hit.slot)) firstHit.set(hit.slot, hit.at); });
engine.on("active", receipt => activeAt.push(receipt.at));
engine.on("log", message => console.error(message));
const onceWhere = <K extends keyof EngineEvents>(event: K, accept: (...args: EngineEvents[K]) => boolean, timeout = 30000) =>
  new Promise<EngineEvents[K]>((resolve, reject) => {
    const done = (...args: EngineEvents[K]) => { if (!accept(...args)) return; cleanup(); resolve(args); };
    const cleanup = () => { clearTimeout(timer); engine.off(event, done as never); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${String(event)} timed out`)); }, timeout);
    engine.on(event, done as never);
  });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function land(slot: string, code: string) {
  const execution = `opening-${slot}-${Date.now()}`;
  const evaluated = onceWhere("evald", receipt => receipt.execution_id === execution);
  const active = onceWhere("active", receipt => receipt.execution_id === execution);
  engine.eval(code, slot, execution);
  const [receipt] = await evaluated;
  if (!receipt.ok) throw new Error(`${slot}: ${receipt.msg}`);
  await active;
}
const mean = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length);
const db = (value: number) => Number((20 * Math.log10(Math.max(value, 1e-8))).toFixed(1));

try {
  const ready = onceWhere("ready", () => true);
  await engine.start(true); await ready;
  const base = makeBase(260921, "vibey", "ambient");
  engine.tempo(base.bpm);
  await Promise.all(Object.entries(base.slots).map(([slot, code]) => land(slot, code)));
  const start = Math.min(...activeAt);
  await wait(21000);
  const clip = await engine.captureClip(path.join(ROOT, "docs/ambient-opening-20s.wav"), 20);
  const segments = Array.from({ length: 5 }, (_, index) => {
    const from = start + index * 4000, to = from + 4000, heard = frames.filter(item => item.at >= from && item.at < to).map(item => item.frame);
    const bands = Array.from({ length: 5 }, (_, band) => db(mean(heard.map(frame => frame.bands[band]))));
    return { seconds: `${index * 4}-${index * 4 + 4}`, rms_db: db(mean(heard.map(frame => frame.rms))),
      peak_db: db(Math.max(...heard.map(frame => frame.peak), 1e-8)), centroid: Math.round(mean(heard.map(frame => frame.centroid))),
      bands_db: { sub: bands[0], low: bands[1], mid: bands[2], high: bands[3], air: bands[4] }, frames: heard.length };
  });
  const entries = Object.fromEntries([...firstHit].sort().map(([slot, at]) => [slot, Number(((at - start) / 1000).toFixed(2))]));
  console.log(JSON.stringify({ bpm: base.bpm, about: base.about, first_event_seconds: entries, segments, clip }, null, 2));
} finally { engine.stop(); }
