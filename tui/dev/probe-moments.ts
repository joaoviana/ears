// Real audio integration check. Always a separate muted server; never reads/writes the performer's set.
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Engine } from "../engine.ts";
import { Bus } from "../bus.ts";
import { Moments, verifyWave } from "../moments.ts";

if (!process.env.EARS_PORT || !process.env.EARS_SC_PORT || process.env.EARS_SC_PORT === "57110" || process.env.EARS_PORT === "57200") throw new Error("Set separate EARS_PORT and EARS_SC_PORT for this muted probe");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-moments-probe-"));
const engine = new Engine(), bus = new Bus().open(0, path.join(dir, "logs"));
const memory = new Moments(engine, bus, path.join(dir, "moments"));
const timeout = setTimeout(() => { console.error("probe timed out"); memory.close(); engine.stop(); void bus.close(); setTimeout(() => process.exit(1), 1000); }, 45000);
function sound(file: string, rate: number) {
  const bytes = fs.readFileSync(file); let data = Buffer.alloc(0);
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4);
    if (bytes.toString("ascii", at, at + 4) === "data") data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + size % 2;
  }
  let sum = 0, peak = 0, crossings = 0, previous = 0;
  for (let at = 0; at < data.length; at += 8) {
    const sample = data.readFloatLE(at);
    assert.ok(Number.isFinite(sample)); sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
    if (previous <= 0 && sample > 0) crossings++; previous = sample;
  }
  const rms = Math.sqrt(sum / (data.length / 8)), hz = crossings / (data.length / 8 / rate);
  assert.ok(rms > 0.001 && peak <= 1, `unexpected level ${rms}, ${peak}`);
  return { rms, peak, hz };
}
engine.on("log", line => { if (process.env.EARS_ENGINE_DEBUG || /ERROR|FAILURE/.test(line)) console.error(line); });
let liveRms = 0;
engine.on("ears", frame => { liveRms = frame.rms; });
try {
  const ready = once(engine, "ready"); engine.start(true); await ready;
  const ringReady = Date.now();
  engine.eval("~momentTone = { SinOsc.ar(330, 0, 0.05) ! 2 }.play; 1", "tone");
  await delay(1800);
  console.log("live tone envelope", liveRms);
  const a = await memory.capture("A", { bar: 1, tempo: 130 }, 0.5);
  assert.equal(a.clip.frames, Math.floor(engine.sampleRate * 0.5)); verifyWave(a.clip.path, a.clip);
  engine.eval("~momentTone.free; ~momentTone = { SinOsc.ar(660, 0, 0.05) ! 2 }.play; 1", "tone2");
  await delay(700);
  const b = await memory.capture("B", { bar: 2, tempo: 130 }, 0.5);
  assert.notEqual(a.clip.sha256, b.clip.sha256);
  const before = sound(a.clip.path, engine.sampleRate), after = sound(b.clip.path, engine.sampleRate);
  assert.ok(Math.abs(before.hz - 330) < 10 && Math.abs(after.hz - 660) < 10);
  const events: string[] = []; engine.on("audition", e => events.push(e.status));
  memory.play([a, b]);
  const deadline = Date.now() + 5000;
  while (memory.playing && Date.now() < deadline) await delay(50);
  assert.equal(memory.playing, "");
  assert.deepEqual(events, ["playing", "ended", "playing", "ended"]);
  const kept = await memory.capture("favorite", { slots: { d1: "test tone" } }, 0.5);
  assert.equal(memory.favorites()[0].id, kept.id);
  memory.play([a, b]); await delay(100); memory.stop(); await delay(700);
  assert.equal(memory.playing, "");
  // Poll around the actual ring boundary (device time can drift from wall time).
  await delay(Math.max(0, 31800 - (Date.now() - ringReady)));
  let wrapped = await memory.capture("B", {}, 2);
  while (wrapped.clip.ring_end_frame! >= wrapped.clip.frames && Date.now() - ringReady < 41000) {
    await delay(150); wrapped = await memory.capture("B", {}, 2);
  }
  assert.ok(wrapped.clip.ring_end_frame! < wrapped.clip.frames, "probe must cross the ring boundary");
  const wrapSound = sound(wrapped.clip.path, engine.sampleRate);
  assert.ok(Math.abs(wrapSound.hz - 660) < 10);
  console.log(JSON.stringify({ result: "PASS", sample_rate: engine.sampleRate, frames: a.clip.frames, before, after, wrapSound, playback: events, directory: dir }));
} finally {
  clearTimeout(timeout); memory.close(); engine.stop(); await bus.close(); await delay(800);
}
