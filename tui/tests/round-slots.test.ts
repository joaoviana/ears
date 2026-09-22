import test from "node:test";
import assert from "node:assert/strict";
import type { AskInput } from "../agent.ts";
import { parse } from "../djs.ts";
import { musicContext } from "../direction.ts";
import { ambientArsenal } from "../ambient-arsenal.ts";

const dj = parse("---\nname: TEST DJ\n---\n# Style\nAmbient\n# Idioms\n- long envelopes\n# Never\n- add a kick\n# Greeting\nhi", "test")!;
const slots = {
  d1: '~d.(\\d1, \\instrument, \\nature, \\buf, ~n.(\\waves), \\dur, 32, \\amp, 0.2)',
  d2: '~d.(\\d2, \\instrument, \\nature, \\buf, ~n.(\\rain), \\dur, 24, \\amp, 0.18)',
  d3: '~d.(\\d3, \\instrument, \\rustle, \\dur, 2.5, \\amp, 0.07)',
  d4: '~d.(\\d4, \\instrument, \\texture, \\buf, ~t.(\\marbles), \\dur, 5, \\amp, 0.14)',
  d5: '~d.(\\d5, \\instrument, \\cloud, \\buf, ~g.(\\brush), \\amp, 0.15)',
  d6: '~d.(\\d6, \\instrument, \\texture, \\buf, ~t.(\\fingertips), \\dur, 3, \\amp, 0.12)',
};
const input = (round: number): AskInput => ({
  dj, slots, context: musicContext(64, { key: "D lydian", root: 38, about: "calm", style: "ambient" }),
  report: "", note: "", history: [], round,
});

// A round offered d3+d6 and d6+d5 at once. Both claim d6, so the host refuses the stack with "both of those
// rewrite d6" -- the performer is shown a choice between options that cannot be combined. Primary slots were
// already distinct; the companion each option answers itself with was not accounted for.
test("two options in a round never touch the same slot, companions included", () => {
  for (let round = 0; round < 24; round++) {
    const options = ambientArsenal(input(round), 2);
    const seen = new Set<string>();
    for (const option of options) {
      for (const part of option.parts) {
        assert.equal(seen.has(part.slot), false,
          `round ${round}: ${part.slot} is claimed twice — ${options.map(o => o.parts.map(p => p.slot).join("+")).join(" and ")}`);
        seen.add(part.slot);
      }
    }
  }
});

test("a round still offers the number of options it was asked for", () => {
  for (let round = 0; round < 12; round++) {
    assert.equal(ambientArsenal(input(round), 2).length, 2, `round ${round} lost an option to the slot rule`);
  }
});
