import test from "node:test"; import assert from "node:assert/strict";
import { locks, alone, layerLines, type Beat } from "../layers.ts";

const on = (slot: string, steps: number[], bars = [0, 1]): Beat[] => bars.flatMap((bar) => steps.map((step) => ({ slot, step, bar })));

test("two voices on the same steps are one layered part", () => {
  const hits = [...on("d1", [0, 4, 8, 12]), ...on("d4", [0, 4, 8, 12])];
  const [l] = locks(hits);
  assert.equal(l.a, "d1"); assert.equal(l.b, "d4");
  assert.equal(l.share, 1);
});

test("a voice on different steps is not a layer", () => {
  const hits = [...on("d1", [0, 4, 8, 12]), ...on("d2", [2, 6, 10, 14])];
  assert.deepEqual(locks(hits), []);
  assert.deepEqual(alone(hits), ["d1", "d2"], "both are carrying their part alone");
});

test("a sparse part inside a busy one counts as doubling it, not the other way round", () => {
  const hits = [...on("d2", [0, 2, 4, 6, 8, 10, 12, 14]), ...on("d3", [4, 12])];
  const [l] = locks(hits, 4);
  assert.equal(l.of, 4, "the smaller part sets the denominator: 4 d3 hits, not 16 d2 ones");
  assert.equal(l.share, 1, "every d3 hit lands on a d2 hit");
  assert.deepEqual(locks(hits, 5), [], "too few hits in the window to call it a layer");
});

test("partial overlap under the threshold is not a layer", () => {
  const hits = [...on("d1", [0, 4, 8, 12]), ...on("d4", [0, 4, 3, 7])];
  assert.deepEqual(locks(hits), [], "half together is two parts that sometimes collide, not one part");
});

test("the report names what is layered and what is alone", () => {
  const hits = [...on("d1", [0, 4, 8, 12]), ...on("d4", [0, 4, 8, 12]), ...on("d2", [1, 3, 5, 7])];
  const lines = layerLines(hits);
  assert.match(lines[0], /d1 and d4 play the same rhythm \(8 of 8 hits together, 100%\)/);
  assert.match(lines[1], /Nothing doubles d2/);
});

test("nothing to say about silence", () => {
  assert.deepEqual(layerLines([]), []);
  assert.deepEqual(locks([]), []);
});
