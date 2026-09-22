import test from "node:test";
import assert from "node:assert/strict";
import { instrumentOf, parseSlot } from "../patch.ts";
import { sourceDiff } from "../evidence.ts";

// The band that reads NOW / BECAUSE / CHANGED / CALLED is rendered inside app.tsx, which a unit test cannot mount.
// What it is built from is testable, and these are the parts that would silently lie rather than visibly break:
// which instrument a slot is said to hold, and whether the per-key diff under CHANGED matches the wire's receipt.

const nature = '~d.(\\d1, \\instrument, \\nature, \\buf, ~n.(\\rain), \\dur, 12, \\amp, 0.2)';
const rustle = '~d.(\\d4, \\instrument, \\rustle, \\delta, Pexprand(14, 46, inf), \\amp, Pwhite(0.055, 0.09))';

test("NOW names the instrument a slot really holds, and says fx when a slot is only colour", () => {
  assert.equal(instrumentOf(nature), "nature");
  assert.equal(instrumentOf(rustle), "rustle");
  // A transform that only sets post-slot colour has no \instrument of its own. Naming it after whatever was there
  // before would be a lie on a projector, so it is reported as fx rather than guessed.
  assert.equal(instrumentOf('~d.(\\d3, \\fxhp, 520, \\fxlp, 7600, \\fxmotion, 0.9)'), "fx");
  assert.equal(instrumentOf(""), "");
});

test("CHANGED reports the same per-key diff the wire publishes, not a second opinion", () => {
  const before = '~d.(\\d3, \\instrument, \\twig, \\delta, Pseq([9, 2.5, 15], inf), \\amp, 0.05)';
  const after = '~d.(\\d3, \\instrument, \\twig, \\delta, Pexprand(9, 17, inf), \\amp, 0.05, \\fxgate, 0.8)';
  const params = sourceDiff(before, after).parameters;
  const byKey = new Map(params.map((p) => [p.key, p]));

  // changed, added, and -- the one that matters for a demo -- untouched keys stay out of it entirely
  assert.equal(byKey.get("delta")?.before, "Pseq([9, 2.5, 15], inf)");
  assert.equal(byKey.get("delta")?.after, "Pexprand(9, 17, inf)");
  assert.equal(byKey.get("fxgate")?.after, "0.8");
  assert.equal(byKey.has("amp"), false);
  assert.equal(byKey.has("instrument"), false);
});

test("a removed key is reported as removed rather than quietly dropped", () => {
  const before = '~d.(\\d2, \\instrument, \\droplet, \\amp, 0.04, \\fxspace, 0.5)';
  const after = '~d.(\\d2, \\instrument, \\droplet, \\amp, 0.04)';
  const gone = sourceDiff(before, after).parameters.find((p) => p.key === "fxspace");
  assert.ok(gone, "dropping fxspace is a change the band has to be able to show");
  assert.equal(gone.before, "0.5");
});

test("an unparseable slot yields no keys, so the band can fall back instead of inventing rows", () => {
  assert.deepEqual(parseSlot("not a slot at all"), []);
  assert.equal(instrumentOf("not a slot at all"), "");
});
