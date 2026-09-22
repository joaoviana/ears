import test from "node:test";
import assert from "node:assert/strict";
import { ask, WILD, type AskInput } from "../agent.ts";
import { parse } from "../djs.ts";
import { DEFAULT_WILD, hasPatternChange, musicContext, patternTask, compositionBrief, PrefetchBank } from "../direction.ts";

const dj = parse("---\nname: TEST DJ\n---\n# Style\nHouse\n# Idioms\n- syncopation\n# Never\n- abandon the pulse\n# Greeting\nhello", "test")!;
const slots = { d2: '~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.("--X---X---X---X-", 0.2))' };
const input: AskInput = { dj, slots, context: musicContext(126, { key: "C major", root: 36, about: "warm", style: "boogie" }), report: "CUT THE HATS: TOO LOUD", note: "", history: [] };
const move = (set: string) => `SLOT d2\n${set}\nEXPECT density same\nWHY displaced hats answer the kick\nEVIDENCE current offbeats`;

test("default creative round assigns three different musical jobs and rotates their mechanisms", () => {
  assert.deepEqual(WILD[DEFAULT_WILD].angles, ["groove", "hook", "turn"]);
  for (const angle of WILD[DEFAULT_WILD].angles) {
    assert.equal(new Set([0, 1, 2, 3].map(round => patternTask(angle, round))).size, 4);
  }
  assert.notEqual(patternTask("turn", 0), patternTask("turn1", 0));
});

test("creative options refuse gain cuts and unchanged rows, accept displaced rhythm", async () => {
  for (const set of ['SET amp = 0.1', 'SET amp = ~x.("--X---X---X---X-", 0.1)\nSET hp = 6000']) {
    await assert.rejects(ask({ ...input, angle: "groove" }, () => assert.fail("mix tweak offered"), () => {}, async () => move(set)), /no angle/);
  }
  const options = await ask({ ...input, angle: "groove" }, () => {}, () => {}, async (prompt, system) => {
    assert.ok(!prompt.includes("CUT THE HATS"), "creative brief must not inherit the ranked correction");
    assert.ok(prompt.includes("126 BPM") && prompt.includes("C major") && prompt.includes("boogie"));
    assert.ok(system.includes(compositionBrief("groove")));
    assert.ok(!system.includes("THIS ROUND'S MUSICAL CHALLENGE"));
    return move('SET amp = ~x.("X--X--X---X--X--", 0.2)');
  });
  assert.equal(options.length, 1);
});

test("repair mode still permits a deliberate gain correction", async () => {
  const options = await ask({ ...input, angle: "fix", wild: 0 }, () => {}, () => {}, async () => move('SET amp = 0.1'));
  assert.equal(options.length, 1);
});

test("a multi-listener skill showcase generates one option, and locked fractures stay locked", async () => {
  const fill = move('SET amp = ~x.("X-XX--X-X-XX--X-", 0.2)') + "\nFOR 1";
  await assert.rejects(ask({ ...input, angle: "groove", skills: [] }, () => assert.fail("locked fill offered"), () => {}, async () => fill), /no angle/);
  let calls = 0;
  const options = await ask({ ...input, angle: "groove", showcase: "fracture", skills: ["fracture"] }, () => {}, () => {}, async () => { calls++; return fill; });
  assert.equal(calls, 1);
  assert.equal(options[0].forBars, 1);
});

test("distinct options for the same voice survive without a slot-collision retry", async () => {
  let calls = 0;
  const options = await ask(input, () => {}, () => {}, async (_prompt, system) => {
    calls++;
    if (system.includes("YOUR ANGLE: groove.")) return move('SET amp = ~x.("X--X--X---X--X--", 0.2)');
    if (system.includes("YOUR ANGLE: hook.")) return move('SET instrument = \\pluck\nSET midinote = Pseq([60, 64, 67, 72], inf)');
    return move('SET dur = 1/3');
  });
  assert.equal(options.length, 3);
  assert.equal(calls, 3);
});

test("a suffixed left turn still gets its creative brief and departure guard", async () => {
  let calls = 0;
  await assert.rejects(ask({ ...input, angle: "turn1" }, () => assert.fail("tweak offered"), () => {}, async (prompt, system) => {
    calls++;
    assert.ok(!prompt.includes("CUT THE HATS"));
    assert.ok(system.includes("YOUR ANGLE: left turn"));
    return move('SET amp = 0.1');
  }), /no angle/);
  assert.equal(calls, 2);
});

test("pattern guard recognises sample rows and note changes without claiming audibility", () => {
  const part = (code: string) => [{ slot: "d2", code, diff: "" }];
  assert.equal(hasPatternChange(slots, part(slots.d2)), false);
  assert.equal(hasPatternChange(slots, part('~d.(\\d2, \\instrument, \\smp, \\buf, ~kp.("s--Cs--Cs--C-t--"))')), true);
});

test("invalidated prefetch cannot resurrect after a new performer instruction", () => {
  const bank = new PrefetchBank<string>();
  const old = bank.token();
  bank.invalidate();
  bank.put(old, "old wildness and tempo");
  assert.equal(bank.take(), null);
  bank.put(bank.token(), "current brief");
  assert.equal(bank.take(), "current brief");
  assert.equal(bank.take(), null);
});

test("a set loaded from disk has unknown key rather than invented or undefined metadata", () => {
  assert.equal(musicContext(128), "128 BPM, key unknown: infer it from the current notes");
});

test("ambient composition brief protects long time scales and nature recordings", () => {
  const brief = compositionBrief("texture", "64 BPM, ambient nature environment");
  assert.match(brief, /16-64 beat spans/);
  assert.match(brief, /nature recordings are foreground material/);
  assert.match(brief, /Do not add a kick/);
});
