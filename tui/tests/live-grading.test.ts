import test from "node:test";
import assert from "node:assert/strict";
import { Evidence, type ObservationBody } from "../evidence.ts";
import { Bus } from "../bus.ts";
import { LiveGrading } from "../live-grading.ts";

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
