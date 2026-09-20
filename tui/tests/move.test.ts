import test from "node:test"; import assert from "node:assert/strict";
import { parseMove, MAX_SLOTS } from "../agent.ts";
import { applyPatch, describeMove } from "../patch.ts";

const ONE = `SLOT d3
SET cutoff = 600
SET res = 2.8
REMOVE pan
EXPECT brightness down
WHY the bass is boxy
EVIDENCE mid 700Hz +4.2 boxy`;

test("a single-slot answer parses exactly as it always did", () => {
  const m = parseMove(ONE)!;
  assert.equal(m.patches.length, 1);
  assert.equal(m.patches[0].slot, "d3");
  assert.deepEqual(m.patches[0].set, [{ key: "cutoff", value: "600" }, { key: "res", value: "2.8" }]);
  assert.deepEqual(m.patches[0].remove, ["pan"]);
  assert.deepEqual(m.expect, { metric: "brightness", dir: "down" });
  assert.equal(m.why, "the bass is boxy");
});

test("SET and REMOVE lines attach to the slot block above them", () => {
  const m = parseMove(`SLOT d2
SET amp = 0.1
SLOT d4
SET duck = 0.75
SET cutoff = 900
REMOVE res
EXPECT sub up
WHY hats step back so the bass can lean in`)!;
  assert.equal(m.patches.length, 2);
  assert.deepEqual(m.patches.map((p) => p.slot), ["d2", "d4"]);
  assert.deepEqual(m.patches[0].set, [{ key: "amp", value: "0.1" }]);
  assert.deepEqual(m.patches[1].set, [{ key: "duck", value: "0.75" }, { key: "cutoff", value: "900" }]);
  assert.deepEqual(m.patches[1].remove, ["res"]);
  assert.deepEqual(m.patches[0].remove, []);          // the REMOVE belonged to d4, not d2
});

test("the move-level lines are found wherever the model puts them", () => {
  const m = parseMove(`WHY everything is straight, so: triplets
SLOT d6 REPLACE
SET instrument = \\perc
SET dur = 1/3
EXPECT density up
SLOT d2
SET amp = 0.08
EVIDENCE nothing has moved in 16 bars`)!;
  assert.equal(m.patches.length, 2);
  assert.equal(m.patches[0].replace, true);
  assert.equal(m.patches[1].replace, false);
  assert.deepEqual(m.expect, { metric: "density", dir: "up" });
  assert.equal(m.evidence, "nothing has moved in 16 bars");
});

test("a slot mentioned twice is one block, and an empty block is dropped", () => {
  const m = parseMove(`SLOT d1
SET amp = 0.9
SLOT d5
SLOT d1
SET tune = 44
EXPECT sub up
WHY louder, lower kick`)!;
  assert.equal(m.patches.length, 1, "d5 had nothing under it");
  assert.deepEqual(m.patches[0].set, [{ key: "amp", value: "0.9" }, { key: "tune", value: "44" }]);
});

test("a move with no WHY, or no slot with anything in it, is not a move", () => {
  assert.equal(parseMove("SLOT d1\nSET amp = 0.9\nEXPECT sub up"), null);
  assert.equal(parseMove("WHY nice idea\nEXPECT sub up"), null);
  assert.equal(parseMove("SLOT d1\nWHY nice idea"), null);
});

test("each slot of a move builds its own expression, and the diff names them", () => {
  const m = parseMove(`SLOT d2
SET amp = 0.08
SLOT d4
SET duck = 0.75
EXPECT sub up
WHY room for the bass`)!;
  const before: Record<string, string> = { d2: "~d.(\\d2, \\instrument, \\hat, \\amp, 0.2)", d4: "~d.(\\d4, \\instrument, \\bass, \\cutoff, 600)" };
  const parts = m.patches.map((p) => ({ slot: p.slot, code: applyPatch(before[p.slot], p), diff: "" }));
  assert.equal(parts[0].code, "~d.(\\d2, \\instrument, \\hat, \\amp, 0.08)");
  assert.equal(parts[1].code, "~d.(\\d4, \\instrument, \\bass, \\cutoff, 600, \\duck, 0.75)");
  assert.equal(describeMove([{ slot: "d2", code: "", diff: "amp 0.2 → 0.08" }, { slot: "d4", code: "", diff: "+ duck 0.75" }]),
    "d2 amp 0.2 → 0.08  |  d4 + duck 0.75");
  assert.equal(describeMove([{ slot: "d2", code: "", diff: "amp 0.2 → 0.08" }]), "amp 0.2 → 0.08");
});

test("more slots than a room can read is refused, not truncated", () => {
  const m = parseMove(["d1", "d2", "d3", "d4"].map((s) => `SLOT ${s}\nSET amp = 0.1`).join("\n") + "\nEXPECT loudness up\nWHY everything at once")!;
  assert.equal(m.patches.length, 4);
  assert.ok(m.patches.length > MAX_SLOTS, "ask() rejects this rather than dropping a slot silently");
});
