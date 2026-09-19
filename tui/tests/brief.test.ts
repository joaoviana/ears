import test from "node:test"; import assert from "node:assert/strict";
import { brief, slotDrift } from "../brief.ts";
const line = (label: string, delta: number, word: string) => ({ label, value: "0.0 dB", delta, word });

test("the worst problem leads, and the rest do not shout", () => {
  const b = brief([line("air  >7kHz", 9, "fizzy"), line("sub  <80Hz", -12, "thin"), line("mid  700Hz", 0.2, "ok")], "the clean track");
  const head = b.split("\n").find((l) => l.startsWith("THE BIGGEST PROBLEM"))!;
  assert.match(head, /thin \(sub/, "sub is 4 tolerances off, air is 3: sub leads");
  assert.match(b, /Then: fizzy \(air/);
});
test("it names the voice that moved", () => {
  const b = brief([line("air  >7kHz", 9, "fizzy")], "x", [{ slot: "d2", db: 8.2 }, { slot: "d1", db: -6.1 }]);
  assert.match(b, /d2 is \+8\.2 dB louder/); assert.match(b, /d1 is -6\.1 dB quieter/);
});
test("it says what counts as a detectable change", () => {
  const b = brief([line("air  >7kHz", 9, "fizzy")], "x", [], { air: 4.1 });
  assert.match(b, /smaller than 4\.1 dB cannot be measured/);
});
test("it says when an agent is stuck on one metric", () => {
  const tried = [{ metric: "air", slot: "d2", grade: "flat" }, { metric: "air", slot: "d2", grade: "flat" }, { metric: "sub", slot: "d1", grade: "hit" }];
  const b = brief([line("air  >7kHz", 9, "fizzy")], "x", [], {}, tried);
  assert.match(b, /ALREADY TRIED.*air ×2/s); assert.match(b, /Stop pushing on air/);
  assert.doesNotMatch(brief([line("air  >7kHz", 9, "fizzy")], "x", [], {}, tried.slice(2)), /ALREADY TRIED/);
});
test("a matching mix says so instead of inventing a problem", () => {
  assert.match(brief([line("air  >7kHz", 0.1, "ok")], "x"), /Nothing is off/);
});
test("slot drift is relative to the whole mix, so turning everything up is not drift", () => {
  const w = (p: number) => ({ power: p, bands: [0, 0, 0, 0, 0], centroid: 1000, frames: 9 });
  const target = { d1: w(1), d2: w(0.01) };
  assert.deepEqual(slotDrift({ d1: w(4), d2: w(0.04) }, target), [], "everything 6 dB louder is not drift");
  const drift = slotDrift({ d1: w(1), d2: w(0.1) }, target);
  assert.equal(drift[0].slot, "d2"); assert.ok(drift[0].db > 8);
});
