import test from "node:test"; import assert from "node:assert/strict";
import { collisions, maskingLines } from "../masking.ts";
// band order: sub low mid high air
const at = (band: number, level: number) => [0, 1, 2, 3, 4].map((i) => (i === band ? level : 0.0001));
/** n frames where `on` decides whether the voice is sounding in that frame */
const series = (slot: string, band: number, on: (i: number) => number, n = 24) => Array.from({ length: n }, (_, i) => ({ slot, bands: at(band, on(i)) }));

test("two voices filling the same band at the same moments are flagged", () => {
  const both = (i: number) => (i % 4 === 0 ? 0.5 : 0.01);
  const c = collisions([...series("d1", 0, both), ...series("d4", 0, both)]);
  assert.equal(c.length, 1); assert.equal(c[0].band, "sub");
  assert.deepEqual([c[0].a, c[0].b], ["d1", "d4"]);
  assert.ok(c[0].overlap > 0.9, `overlap ${c[0].overlap}`);
});
test("two voices in the same band that never coincide are not a collision", () => {
  const onBeat = (i: number) => (i % 4 === 0 ? 0.5 : 0.01), offBeat = (i: number) => (i % 4 === 2 ? 0.5 : 0.01);
  assert.deepEqual(collisions([...series("d1", 0, onBeat), ...series("d4", 0, offBeat)]), []);
});
test("voices in different bands are not a collision", () => {
  const both = (i: number) => (i % 4 === 0 ? 0.5 : 0.01);
  assert.deepEqual(collisions([...series("d1", 0, both), ...series("d2", 4, both)]), []);
});
test("a voice 20 dB below the loudest in a band is not competing with it", () => {
  const loud = (i: number) => (i % 4 === 0 ? 0.5 : 0.01), faint = (i: number) => (i % 4 === 0 ? 0.005 : 0.0001);
  assert.deepEqual(collisions([...series("d1", 0, loud), ...series("d4", 0, faint)]), []);
});
test("one voice alone can never collide, and the lines read as advice", () => {
  const both = (i: number) => (i % 4 === 0 ? 0.5 : 0.01);
  assert.deepEqual(collisions(series("d1", 0, both)), []);
  const lines = maskingLines([...series("d1", 0, both), ...series("d4", 0, both)]);
  assert.match(lines[0], /d1 and d4 are both filling sub/); assert.match(lines[0], /duck one under the other/);
});
