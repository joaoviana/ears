import test from "node:test"; import assert from "node:assert/strict";
import { SlotEars, slotDifference } from "../slotears.ts";
const frame = (slot: string, rms: number, centroid = 1000, bands = [0.1, 0.1, 0.1, 0.1, 0.1]) => ({ slot, rms, centroid, bands });
const master = { onsets_per_beat: 0, peak_to_envelope_db: 0 };

test("a window needs enough frames, and averages what it has", () => {
  const e = new SlotEars(); const t0 = Date.now();
  e.push(frame("d1", 0.5)); e.push(frame("d1", 0.5));
  assert.equal(e.window("d1", t0 - 1000, Date.now() + 1000), null, "two frames is not a window");
  e.push(frame("d1", 0.5));
  const w = e.window("d1", t0 - 1000, Date.now() + 1000)!;
  assert.ok(Math.abs(w.power - 0.25) < 1e-9); assert.equal(w.frames, 3);
});
test("only the edited slot moves: a louder hat raises air, and the other slots are held still", () => {
  const before = { d1: { power: 1, bands: [1, 0.5, 0.2, 0.05, 0.01], centroid: 80, frames: 9 }, d2: { power: 0.01, bands: [0, 0, 0.002, 0.004, 0.004], centroid: 7000, frames: 9 } };
  const after = { ...before, d2: { power: 0.04, bands: [0, 0, 0.008, 0.016, 0.016], centroid: 7000, frames: 9 } };
  const d = slotDifference(before, after, "d2", master)!;
  assert.ok(d.relative_bands_db.air > 2, `air moved ${d.relative_bands_db.air}`);
  assert.ok(d.centroid_hz > 50, "brightness rises when the bright slot gets louder");
  assert.ok(d.envelope_db > 0);
});
test("a slot nobody heard cannot be graded", () => {
  const before = { d1: { power: 1, bands: [1, 0, 0, 0, 0], centroid: 80, frames: 9 } };
  assert.equal(slotDifference(before, before, "d5", master), null);
});
