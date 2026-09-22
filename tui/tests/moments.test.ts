import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Moments, verifyWave, windowEvidence } from "../moments.ts";
import type { Msg } from "../bus.ts";

function wave(file: string) {
  const frames = 800, rate = 8000, bytes = Buffer.alloc(44 + frames * 4);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(frames * 4, 40); fs.writeFileSync(file, bytes);
  return { path: file, frames, sample_rate: rate, start_ms: Date.now() - 100, end_ms: Date.now() };
}
function harness(t: { after: (f: () => void) => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-moments-test-"));
  const engine = new (class extends EventEmitter {
    calls: { file: string; id: string }[] = []; stops = 0;
    async captureClip(file: string) { return wave(file); }
    audition(file: string, id: string) { this.calls.push({ file, id }); }
    stopAudition() { this.stops++; }
  })();
  const wire = new (class extends EventEmitter {
    session = "test"; recent: Msg[] = [];
    send(type: string, from: string, body: Record<string, unknown> = {}) {
      const m: Msg = { ...body, v: 0, t: Date.now(), bar: 1, type, from }; this.recent.push(m); this.emit("msg", m); return m;
    }
  })();
  const memory = new Moments(engine, wire, dir);
  t.after(() => { memory.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, engine, wire, memory };
}

test("a mixed window retains preceding state, changes, execution and overlapping observation IDs", () => {
  const message = (type: string, t: number, body = {}) => ({ v: 0, bar: 0, type, from: "host", t, ...body }) as Msg;
  const state = message("state", 50, { revision: "old", slots: { d1: "kick" } });
  const change = message("active", 120, { execution_id: "e1" });
  const report = message("observation", 220, { id: "o1", window: { start_ms: 100, end_ms: 210 } });
  const evidence = windowEvidence([state, change, report], 100, 200);
  assert.equal(evidence.state_at_window_start, state);
  assert.deepEqual(evidence.events, [change]);
  assert.deepEqual(evidence.execution_ids, ["e1"]);
  assert.deepEqual(evidence.observation_ids, ["o1"]);
});
test("favorites survive a fresh controller, preserve source, and alone emit explicit keep", async t => {
  const { memory, wire, engine, dir } = harness(t);
  const context = { slots: { d1: "kick" }, bar: 12, tempo: 130 };
  const a = await memory.capture("A", context);
  const kept = await memory.capture("favorite", context);
  context.slots.d1 = "changed";
  assert.equal((kept.context_at_request.slots as any).d1, "kick");
  assert.equal(wire.recent.filter(m => m.type === "preference").length, 1);
  assert.equal(wire.recent.find(m => m.type === "preference")?.artifact_id, kept.id);
  memory.close(); const reopened = new Moments(engine, wire, dir);
  assert.deepEqual(reopened.favorites().map(m => m.id), [kept.id]); reopened.close();
  assert.equal(a.attribution, "unverified"); assert.equal(kept.timing_uncertainty_ms, null);
});
test("A then B uses completion receipts; cancellation ignores late receipts and returns live", async t => {
  const { memory, engine } = harness(t);
  const a = await memory.capture("A", {}), b = await memory.capture("B", {});
  memory.play([a, b]); const first = engine.calls[0];
  assert.equal(engine.calls.length, 1);
  engine.emit("audition", { id: first.id, status: "ended" });
  assert.equal(engine.calls[1].file, b.clip.path);
  memory.stop();
  engine.emit("audition", { id: first.id, status: "ended" });
  assert.equal(memory.playing, ""); assert.equal(engine.calls.length, 2);
});
test("capture refuses replay; corrupt audio is refused before any audition", async t => {
  const { memory, engine } = harness(t);
  const a = await memory.capture("A", {}); memory.play([a]);
  await assert.rejects(memory.capture("favorite", {}), /return live/);
  memory.stop(); fs.writeFileSync(a.clip.path, "bad");
  assert.throws(() => memory.play([a]), /invalid WAV/);
  assert.equal(engine.calls.length, 1);
});
test("failed capture publishes neither audio evidence nor a favorite", async t => {
  const { memory, engine, wire } = harness(t);
  engine.captureClip = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(memory.capture("favorite", {}), /disk unavailable/);
  assert.equal(memory.capturing, false); assert.equal(memory.favorites().length, 0);
  assert.equal(wire.recent.some(m => m.type === "preference" || m.type === "audio_artifact"), false);
});
test("WAV verification catches truncation and mismatched frame counts", t => {
  const { dir } = harness(t), file = path.join(dir, "check.wav"), capture = wave(file);
  assert.equal(verifyWave(file, capture).length, 64);
  assert.throws(() => verifyWave(file, { ...capture, frames: 799 }), /metadata/);
  fs.truncateSync(file, 50); assert.throws(() => verifyWave(file, capture), /incomplete/);
});
