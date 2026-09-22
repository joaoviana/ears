import test from "node:test";
import assert from "node:assert/strict";
import { Evidence, type ObservationBody } from "../evidence.ts";
import { Bus } from "../bus.ts";
import { LiveGrading } from "../live-grading.ts";
import { slotDifference, slotOwnDifference } from "../slotears.ts";

const metrics = { envelope_dbfs: -12, peak_to_envelope_db: 4, centroid_hz: 1000, onsets_per_beat: 1,
  width_db: -6, headroom_db: 5, off_grid_beats: 0, bands_dbfs: { sub: -12, low: -12, mid: -12, high: -12, air: -12 } };
const shot = { agent: "guest", name: "Guest", rgb: [1, 2, 3], slot: "d2", expect: { metric: "brightness" as const, dir: "up" as const } };
const difference = { envelope_db: 0, peak_to_envelope_db: 0, centroid_hz: 900, onsets_per_beat: 0, relative_bands_db: {} };

test("each call yields one outcome and overlapping changes remain ungraded", () => {
  const evidence = new Evidence("test", () => {}), bus = new Bus(), grading = new LiveGrading(evidence, bus, ["d2"]);
  grading.call(1, shot);
  const comparison = { id: "c1", execution_id: "e1", proposal: 1, status: "measured" as const, differences: difference, confounds: ["other state or activation changes occurred"] };
  evidence.emit("comparison", comparison); evidence.emit("comparison", comparison);
  assert.equal(bus.recent.length, 1); assert.equal(bus.recent[0].grade, "ungraded");
  grading.close();
});

test("calibration uses measured stereo width and groove rather than nonexistent band entries", () => {
  const evidence = new Evidence("test", () => {}), bus = new Bus(), grading = new LiveGrading(evidence, bus, []);
  for (let i = 0; i < 5; i++) {
    const body: ObservationBody = { id: `o${i}`, state_revision: "s1", active_revisions: [1], quality: { stable_state: true }, window: null,
      metrics: { ...metrics, width_db: -6 + i * 2, off_grid_beats: i * 0.01 } };
    evidence.emit("observation", body);
  }
  assert.equal(grading.floor("width"), 4);
  assert.equal(grading.floor("groove"), 20);
  grading.close();
});

test("a missing linked slot window falls back to master rather than borrowing unrelated observations", () => {
  const evidence = new Evidence("test", () => {}), bus = new Bus(), grading = new LiveGrading(evidence, bus, ["d2"]);
  grading.call(1, shot);
  evidence.emit("comparison", { id: "c1", execution_id: "e1", proposal: 1, before: "expired", after: "missing", status: "measured", differences: difference, confounds: [] });
  assert.deepEqual(bus.recent[0].scope, { kind: "master", per_voice: false, estimate: undefined });
  assert.equal(bus.recent[0].grade, "hit"); grading.close();
});

test("an engine evaluation failure is not reported as an audible outcome", () => {
  const evidence = new Evidence("test", () => {}), bus = new Bus(), grading = new LiveGrading(evidence, bus, ["d2"]);
  grading.call(7, shot);
  evidence.emit("comparison", { id: "c-failed", execution_id: "e-failed", proposal: 7, status: "unavailable", confounds: ["evaluation failed; inspect engine state"] });
  assert.equal(bus.recent.length, 0);
  grading.close();
});

test("a two-slot move is graded on its primary slot: the companion's comparison does not consume the shot", () => {
  const evidence = new Evidence("test", () => {}), bus = new Bus(), grading = new LiveGrading(evidence, bus, ["d4", "d3"]);
  const outcomes: GradedShot[] = []; grading.on("outcome", (o) => outcomes.push(o));
  grading.call(9, { agent: "resident", name: "The Resident", rgb: [0, 0, 0], slot: "d4", stacked: true, expect: { metric: "loudness", dir: "up" } });
  const body = (slot: string, id: string): ComparisonBody => ({ id, execution_id: `e-${slot}`, proposal: 9, slot, status: "measured", confounds: [],
    differences: { envelope_db: 3, peak_to_envelope_db: 0, centroid_hz: 0, onsets_per_beat: 0, relative_bands_db: { sub: 0, low: 0, mid: 0, high: 0, air: 0 } } });
  evidence.emit("comparison", body("d3", "c1"));
  assert.equal(outcomes.length, 0, "the companion slot reported first; the shot waits");
  evidence.emit("comparison", body("d4", "c2"));
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcome.grade, "hit");
});

test("a claim about a move is graded on the changed layer's own meter, not on its share of the mix", () => {
  const before = { d6: { power: 1e-4, bands: [1e-6, 1e-6, 1e-5, 1e-6, 1e-7], centroid: 900, frames: 10 }, d1: { power: 1e-2, bands: [1e-3, 1e-3, 1e-3, 1e-3, 1e-4], centroid: 1200, frames: 10 } };
  const after = { d6: { power: 1e-4, bands: [1e-6, 1e-6, 1e-4, 1e-6, 1e-7], centroid: 900, frames: 10 }, d1: before.d1 };
  // the layer's middle rose tenfold (+10 dB) while the six-layer mix barely moved: the layer's own view says so
  const own = slotOwnDifference(before, after, "d6", { onsets_per_beat: 0, peak_to_envelope_db: 0 })!;
  assert.ok(own.relative_bands_db.mid > 9 && own.relative_bands_db.mid < 11, String(own.relative_bands_db.mid));
  const mix = slotDifference(before, after, "d6", { onsets_per_beat: 0, peak_to_envelope_db: 0 })!;
  assert.ok(Math.abs(mix.relative_bands_db.mid) < 1, String(mix.relative_bands_db.mid));
});
