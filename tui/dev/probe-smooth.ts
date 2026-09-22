// Separate muted engine: verify the wash stays finite/continuous and tempo glides instead of jumping.
import { once } from "node:events";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Engine } from "../engine.ts";

if (!process.env.EARS_PORT || !process.env.EARS_SC_PORT || process.env.EARS_PORT === "57200" || process.env.EARS_SC_PORT === "57110") throw new Error("Use separate engine ports");
process.env.EARS_ENGINE_DEBUG = "1";
const engine = new Engine(), errors: string[] = [], levels: number[] = [], tempos: number[] = [], drops: string[] = [];
engine.on("log", line => {
  if (/ERROR|FAILURE/.test(line)) { errors.push(line); console.error(line); }
  const m = line.match(/SMOOTH_TEMPO ([\d.]+)/); if (m) tempos.push(Number(m[1]));
});
engine.on("ears", frame => { if (engine.ready) levels.push(frame.rms); });
engine.on("dropped", kind => drops.push(kind));
const timeout = setTimeout(() => { engine.stop(); process.exitCode = 1; }, 30000);
try {
  const ready = once(engine, "ready"); engine.start(true);
  await Promise.race([ready, delay(12000).then(() => { throw new Error("engine did not boot"); })]);
  engine.eval('~smoothTone = { SinOsc.ar(330, 0, 0.04) ! 2 }.play; ~smoothPoll = Routine { 70.do { ("SMOOTH_TEMPO " ++ (~clock.tempo * 60)).postln; 0.1.wait } }.play(SystemClock); 1', "probe-tone");
  await delay(1200); levels.length = 0;
  engine.transition("wash", 1, 1);
  engine.tempo(145, 1);
  await delay(5200);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(levels.length > 40 && levels.every(x => Number.isFinite(x) && x > 0.001), "wash must not cut to silence or produce NaN");
  assert.ok(Math.max(...levels) < 0.5, "wash must not produce a level burst");
  assert.ok(tempos.some(x => x > 130.1 && x < 144.9), "tempo must visit intermediate values");
  assert.ok(tempos.some(x => Math.abs(x - 145) < 0.01), "tempo must reach target");
  console.log(JSON.stringify({ result: "PASS", frames: levels.length, minimumRms: Math.min(...levels), maximumRms: Math.max(...levels), distinctTempos: new Set(tempos).size, drops }));
} finally { clearTimeout(timeout); engine.stop(); await delay(600); }
