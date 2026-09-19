import test from "node:test"; import assert from "node:assert/strict";
import { parseExpect, grade, NoiseFloor, forPrompt } from "../shots.ts";
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
test("a miss tells the DJ it was wrong", () => { const e = { metric: "sub", dir: "up" } as const; assert.match(forPrompt(e, grade(e, diff({ sub: -3 }), 1.2)), /MISS.*you were wrong/); });
