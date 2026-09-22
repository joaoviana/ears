import { Engine } from "../engine.ts";
import { makeBase } from "../seed.ts";
import { AMBIENT_ARSENAL, ambientArsenal } from "../ambient-arsenal.ts";
import { musicContext } from "../direction.ts";
import { roster } from "../djs.ts";

process.env.EARS_PORT ||= "57323";
process.env.EARS_SC_PORT ||= "57200";

const engine = new Engine();
engine.on("log", message => console.error(message));
const once = <T>(event: string, timeout = 30000) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
  engine.once(event as never, ((value: T) => { clearTimeout(timer); resolve(value); }) as never);
});

async function evaluate(code: string, id: string) {
  const receipt = once<{ id: string; ok: boolean; msg: string }>("evald");
  engine.eval(code, id);
  const result = await receipt;
  if (!result.ok) throw new Error(`${id}: ${result.msg}`);
}

try {
  const ready = once<void>("ready");
  await engine.start(true); await ready;
  const base = makeBase(260921, "vibey", "ambient");
  engine.tempo(base.bpm);
  for (const [slot, code] of Object.entries(base.slots)) await evaluate(code, `base-${slot}`);
  for (const seed of AMBIENT_ARSENAL) await evaluate(seed.code, `arsenal-${seed.id}`);
  const dj = roster().find(candidate => candidate.id === "resident")!;
  const arrangements = Array.from({ length: AMBIENT_ARSENAL.length }, (_, round) => ambientArsenal({ dj, round,
    slots: base.slots, context: musicContext(base.bpm, base), report: "", note: "", history: [] })).flat();
  // ambientArsenal validates every generated part. Evaluating all of them here would schedule 100+ long-tail patterns
  // into six slots before the next bar and stress the temporary server rather than test syntax.
  console.log(JSON.stringify({ compiled: AMBIENT_ARSENAL.map(seed => seed.id), validated_arrangement_parts: arrangements.reduce((n, option) => n + option.parts.length, 0) }, null, 2));
} finally { engine.stop(); }
