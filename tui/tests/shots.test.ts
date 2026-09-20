import test from "node:test"; import assert from "node:assert/strict";
import { parseExpect, grade, NoiseFloor, forPrompt, attributable, MIN_SAMPLES } from "../shots.ts";
const diff = (over: Partial<{ envelope_db: number; centroid_hz: number; onsets_per_beat: number; peak_to_envelope_db: number; sub: number }>) => ({ envelope_db: over.envelope_db ?? 0, peak_to_envelope_db: over.peak_to_envelope_db ?? 0, centroid_hz: over.centroid_hz ?? 0, onsets_per_beat: over.onsets_per_beat ?? 0, relative_bands_db: { sub: over.sub ?? 0, low: 0, mid: 0, high: 0, air: 0 } });

test("EXPECT lines parse, with aliases, and reject unknown metrics", () => {
  assert.deepEqual(parseExpect("EXPECT brightness down"), { metric: "brightness", dir: "down" });
  assert.deepEqual(parseExpect("expect: centroid lower"), { metric: "brightness", dir: "down" });
  assert.deepEqual(parseExpect("EXPECT sub up"), { metric: "sub", dir: "up" });
  assert.deepEqual(parseExpect("EXPECT loudness same"), { metric: "loudness", dir: "same" });
  assert.equal(parseExpect("EXPECT vibes up"), null);
  assert.equal(parseExpect("WHY it will be darker"), null);
});
test("a call is a hit only in the right direction and outside the noise", () => {
  assert.equal(grade({ metric: "brightness", dir: "down" }, diff({ centroid_hz: -600 }), 220).grade, "hit");
  assert.equal(grade({ metric: "brightness", dir: "down" }, diff({ centroid_hz: +600 }), 220).grade, "miss");
  assert.equal(grade({ metric: "brightness", dir: "down" }, diff({ centroid_hz: -90 }), 220).grade, "flat");
  assert.equal(grade({ metric: "sub", dir: "same" }, diff({ sub: 0.4 }), 1.2).grade, "hit");
  assert.equal(grade({ metric: "sub", dir: "same" }, diff({ sub: 3 }), 1.2).grade, "miss");
  assert.equal(grade({ metric: "sub", dir: "up" }, null, 1.2).grade, "ungraded");
});
test("the noise floor rises when the unchanged music itself moves, and never drops below the base", () => {
  const n = new NoiseFloor(), abs = (c: number) => ({ sub: 0, low: 0, mid: 0, high: 0, air: 0, brightness: c, loudness: 0, density: 0, punch: 0 });
  assert.equal(n.floor("brightness"), 220);
  for (const c of [3000, 3400, 2950, 3500, 3000]) n.push("s1:a1", abs(c));
  assert.ok(n.floor("brightness") > 800, String(n.floor("brightness")));
  n.push("s2:a2", abs(9000));   // a different state is not a noise sample
  assert.ok(n.floor("brightness") < 1200);
  assert.equal(n.floor("sub"), 1.2);
});
test("a miss says the mix moved the other way, not that the DJ's change caused it", () => {
  const e = { metric: "sub", dir: "up" } as const, line = forPrompt(e, grade(e, diff({ sub: -3 }), 1.2));
  assert.match(line, /MISS/); assert.match(line, /the mix moved the other way/); assert.doesNotMatch(line, /you were wrong/);
  assert.match(forPrompt(e, grade(e, diff({ sub: -3 }), 1.2), false), /it was called/);   // another DJ's record is not addressed to you
});
// The exact four the host attaches to EVERY measured comparison (evidence.ts). They are properties of live
// observation, not events. Treating one of them as a confound silently ungrades every shot in a real set, which
// is what happened: the benchmark grades directly and stayed green while the TUI graded nothing at all.
const STANDING = ["live master mix, not an isolated voice", "different musical time; stochastic patterns and effect tails may differ",
  "no controlled A/B render or causal attribution", "shared effects and master processing are not isolated"];
test("the standing disclaimers on a live comparison do not make it unattributable", () => {
  assert.equal(attributable(STANDING), true, "if this fails, the live host has stopped grading called shots");
  assert.equal(attributable([]), true);
});
test("a comparison with a concrete overlapping event is not attributable", () => {
  assert.equal(attributable([...STANDING, "other state or activation changes occurred"]), false);
  assert.equal(attributable([...STANDING, "a mixer transition was riding during this window"]), false);
});
test("the noise floor says when it is not calibrated yet", () => {
  const n = new NoiseFloor(), abs = (c: number) => ({ sub: 0, low: 0, mid: 0, high: 0, air: 0, brightness: c, loudness: 0, density: 0, punch: 0 });
  for (let i = 0; i <= MIN_SAMPLES; i++) { assert.equal(n.ready("brightness"), false, `ready after ${i} pushes`); assert.equal(n.floor("brightness"), 220, "uncalibrated floors use the fixed default"); n.push("s1:a1", abs(3000 + i * 1000)); }
  assert.equal(n.ready("brightness"), true);
  assert.ok(n.floor("brightness") > 1000);
});
