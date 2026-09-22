import test from "node:test"; import assert from "node:assert/strict";
import { parseMove, validate, ambientBrief, MAX_SLOTS } from "../agent.ts";
import { applyPatch, describeMove, pair } from "../patch.ts";

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

test("a change late in a long row is visible on the projector, not cut off before it", () => {
  const a = '~x.(["----X-------X---", "----X-------X---", "----X-------X---", "----X---X---X-x-"], 0.5)';
  const b = '~x.(["----X-------X---", "----X-------X---", "----X-------X---", "--x-X---X-xxX-x-"], 0.5)';
  const [x, y] = pair(a, b);
  assert.notEqual(x, y, "two rows that differ must not render identically");
  assert.ok(x.includes("X---X---X-x-") || y.includes("x-X---X-xxX"), `window landed on the difference: ${x} -> ${y}`);
  assert.deepEqual(pair("600", "350"), ["600", "350"]);                       // short values are untouched
});

test("a rewrite only has to name the instrument, the notes and the rhythm", () => {
  const m = parseMove(`SLOT d6 REPLACE
SET instrument = \\pluck
SET dur = 1/4
SET midinote = Pseq([67, 72, 74], inf)
EXPECT density up
WHY a pluck answers the gaps`)!;
  const code = applyPatch("", m.patches[0]);
  for (const k of ["amp", "dec", "tone", "send"]) assert.ok(code.includes("\\" + k + ", "), `${k} should come from the instrument's defaults — got ${code}`);
  assert.match(code, /\\midinote, Pseq\(\[67, 72, 74\], inf\)/);
});

test("anything the agent does set beats the default", () => {
  const m = parseMove("SLOT d1 REPLACE\nSET instrument = \\kick\nSET amp = 0.4\nEXPECT loudness down\nWHY quieter kick")!;
  assert.match(applyPatch("", m.patches[0]), /\\amp, 0\.4/);
  assert.doesNotMatch(applyPatch("", m.patches[0]), /\\amp, 0\.9/);
});

test("an unknown instrument gets no defaults rather than the wrong ones", () => {
  const m = parseMove("SLOT d1 REPLACE\nSET instrument = \\theremin\nSET dur = 1\nEXPECT air up\nWHY nope")!;
  assert.equal(applyPatch("", m.patches[0]), "~d.(\\d1, \\instrument, \\theremin, \\dur, 1)");
});

test("grammar words that leak into a value are read as grammar, and unknown classes never reach the engine", () => {
  const p = parseMove("SLOT d6\nSET delta = Pseq([0.5, 0.5, 5], inf) FOR 2\nSET buf = REMOVE\nEXPECT density up\nWHY a burst\nEVIDENCE d6")!;
  assert.equal(p.forBars, 2);
  assert.deepEqual(p.patches[0].set, [{ key: "delta", value: "Pseq([0.5, 0.5, 5], inf)" }]);
  assert.deepEqual(p.patches[0].remove, ["buf"]);
  assert.match(validate({ slot: "d6", code: "~d.(\\d6, \\instrument, \\twig, \\delta, Pseq([1], inf) FOR 2)" }) ?? "", /FOR/);
  assert.match(validate({ slot: "d6", code: "~d.(\\d6, \\instrument, \\twig, \\buf, REMOVE)" }) ?? "", /REMOVE/);
  assert.match(validate({ slot: "d6", code: "~d.(\\d6, \\instrument, \\twig, \\delta, Pseqq([1], inf))" }) ?? "", /Pseqq/);
  assert.equal(validate({ slot: "d6", code: "~d.(\\d6, \\instrument, \\twig, \\delta, Pwrand([0.125, Pexprand(16, 34, 1)], [0.5, 0.5], inf), \\midinote, Pseq([62, Rest(1)], inf), \\lp, ~arc.(1500, 8600, 44), \\amp, ~x.(\"X---x---\", 0.3))" }), null);
});

test("the ambient brief tells the model how its claim is checked: on the changed layer's own meter", () => {
  const brief = ambientBrief();
  assert.match(brief, /FIRST slot of your move/);
  assert.match(brief, /own meter/);
  assert.match(brief, /Never say "same" for a layer you are changing/);
});
