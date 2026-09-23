import test from "node:test"; import assert from "node:assert/strict";
import { aimAt, quietLine } from "../aim.ts";
import { movedSlots, movedReason } from "../staleness.ts";

const full = { d1: "a", d2: "b", d3: "c", d4: "d", d5: "e", d6: "f" };

test("fix goes where the measured drift is worst, add goes to an empty voice", () => {
  const aim = aimAt({ round: 0, wild: 0, bar: 20, drift: [{ slot: "d4" }], slots: { ...full, d5: "  " }, touched: {} });
  assert.equal(aim.fix, "d4");
  assert.equal(aim.add, "d5");
  assert.notEqual(aim.turn, aim.fix);
  assert.notEqual(aim.turn, aim.add);
});

test("with no drift measured, fix goes to the voice left alone longest and add to a different one", () => {
  const touched = { d1: { bar: 18 }, d2: { bar: 2 }, d3: { bar: 10 }, d4: { bar: 19 }, d5: { bar: 19 }, d6: { bar: 19 } };
  const aim = aimAt({ round: 0, wild: 0, bar: 20, drift: [], slots: full, touched });
  assert.equal(aim.fix, "d2");
  assert.equal(aim.add, "d3");
});

test("a wild booth turns the lead voice, and groove and hook alternate by round", () => {
  const a = aimAt({ round: 0, wild: 2, bar: 0, drift: [], slots: full, touched: {} });
  const b = aimAt({ round: 1, wild: 2, bar: 0, drift: [], slots: full, touched: {} });
  assert.equal(a.turn, "d6");
  assert.notEqual(a.groove, b.groove);
  assert.notEqual(a.hook, b.hook);
});

test("the quiet line names only voices untouched for eight bars, and says so when there are none", () => {
  assert.equal(quietLine(full, { d1: { bar: 5 }, d2: { bar: 5 }, d3: { bar: 5 }, d4: { bar: 5 }, d5: { bar: 5 }, d6: { bar: 5 } }, 10),
    "Everything has been touched in the last 8 bars.");
  const line = quietLine({ d1: "a", d2: "b" }, { d1: { bar: 0 }, d2: { bar: 9 } }, 12);
  assert.match(line, /d1 for 12 bars/);
  assert.doesNotMatch(line, /d2/);
});

test("an idea is stale only through the slots it touches, and whitespace is not a change", () => {
  const saw = { d1: "kick", d3: "bass" };
  assert.deepEqual(movedSlots(["d1", "d3"], saw, { d1: " kick\n", d3: "bass", d4: "changed" }), []);
  assert.deepEqual(movedSlots(["d1", "d3"], saw, { d1: "kick", d3: "bass2" }), ["d3"]);
  assert.match(movedReason(["d3"]), /^d3 changed since this idea was formed/);
});
