import path from "node:path";
import { Engine, ROOT, type Ears } from "../engine.ts";
import { makeBase } from "../seed.ts";

process.env.EARS_PORT ||= "57321";
process.env.EARS_SC_PORT ||= "57198";

const engine = new Engine();
const frames: Ears[] = [];
engine.on("ears", frame => frames.push(frame));
engine.on("log", message => console.error(message));

const once = <T>(event: string, timeout = 30000) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
  engine.once(event as never, ((value: T) => { clearTimeout(timer); resolve(value); }) as never);
});

try {
  const ready = once<void>("ready");
  await engine.start(true);
  await ready;
  const base = makeBase(260921, "vibey", "ambient");
  engine.tempo(base.bpm);
  for (const [slot, code] of Object.entries(base.slots)) {
    const receipt = once<{ id: string; ok: boolean; msg: string }>("evald");
    engine.eval(code, `ambient-${slot}`);
    const result = await receipt;
    if (!result.ok) throw new Error(`${slot}: ${result.msg}`);
  }
  await new Promise(resolve => setTimeout(resolve, 12000));
  const file = path.join(ROOT, "docs/ambient-first-light.wav");
  const clip = await engine.captureClip(file, 8);
  const heard = frames.slice(-20);
  const mean = (key: "rms" | "peak" | "centroid" | "flatness") => heard.reduce((sum, frame) => sum + frame[key], 0) / Math.max(1, heard.length);
  console.log(JSON.stringify({ style: base.style, bpm: base.bpm, key: base.key, clip, frames: heard.length,
    mean: { rms: mean("rms"), peak: mean("peak"), centroid: mean("centroid"), flatness: mean("flatness") } }, null, 2));
} finally {
  engine.stop();
}
