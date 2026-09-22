import test from "node:test";
import assert from "node:assert/strict";
import { AMBIENT_ARSENAL, MEASURED, ambientArsenal, ambientSkillArsenal, ambientTide } from "../ambient-arsenal.ts";
import { fastRound, RHYTHMIC } from "../fast-round.ts";
import { makeBase } from "../seed.ts";
import { musicContext } from "../direction.ts";
import { parse, roster, isAmbientDJ } from "../djs.ts";
import { ask, validate, type AskInput, type Suggestion } from "../agent.ts";

// These rounds were written for the two-instant-seat layout; the default is now one instant seat then the model.
process.env.EARS_INSTANT = "2";

const dj = parse("---\nname: TEST\n---\n# Style\nCalm organic ambience\n# Idioms\n- sparse natural gestures\n# Never\n- voices", "test")!;
const base = makeBase(1, "vibey", "ambient");
const input = (round = 0): AskInput => ({ dj, round, slots: base.slots, context: musicContext(base.bpm, base), report: "", note: "", history: [] });

test("ambient arsenal has at least twenty-four valid, distinct, voice-free compositions", () => {
  assert.ok(AMBIENT_ARSENAL.length >= 24);
  assert.equal(new Set(AMBIENT_ARSENAL.map(seed => seed.id)).size, AMBIENT_ARSENAL.length);
  for (const seed of AMBIENT_ARSENAL) {
    assert.equal(validate({ slot: seed.slot, code: seed.code }), null, seed.id);
    assert.doesNotMatch(seed.code, /\\(?:vox|voxpad|choir|kick|hat|clap|snare|rim|bass)\b/i, seed.id);
    assert.doesNotMatch(seed.code, /\\instrument, \\porcelain\b/i, seed.id);
  }
});

test("the expanded palette has audible high, low and stochastic rhythm roles", () => {
  const get = (id: string) => AMBIENT_ARSENAL.find(seed => seed.id === id)!.code;
  assert.match(get("air-flutter"), /\\freq, Pbrown\(3800, 7200/);
  assert.match(get("understone"), /\\sub, Pwhite\(38, 52\)/);
  for (const id of ["air-flutter", "understone", "brush-burst", "bird-grain", "paper-fall"])
    assert.match(get(id), /P(?:exprand|white|brown|wrand)\(/i, id);
  assert.match(get("brush-burst"), /Pexprand\(4\.5, 10, 1\)/);
});

test("close material gestures carry a bounded low body impulse in the warm-low register, not the sub", () => {
  for (const id of ["fingertips", "marbles"]) {
    const code = AMBIENT_ARSENAL.find(seed => seed.id === id)!.code;
    assert.match(code, /\\sub, Pwhite\(0\.[12]/);
    const lo = Number(code.match(/\\subfreq, Pwhite\((\d+),/)![1]);
    assert.ok(lo >= 48 && lo <= 90, `${id} knock starts at ${lo} Hz: a 38-42 Hz thump measured 25 dB over the bed`);
  }
});

test("each ambient round immediately offers two different musical roles", () => {
  for (let round = 0; round < AMBIENT_ARSENAL.length; round++) {
    const options = ambientArsenal(input(round));
    assert.equal(options.length, 2, `round ${round}`);
    assert.equal(new Set(options.map(option => option.slot)).size, 2, `round ${round}`);
    assert.ok(options.every(option => option.origin === "recipe"));
    for (const option of options) {
      assert.equal(option.parts.length, 2, `${option.recipe_id} should be an arrangement move`);
      assert.equal(new Set(option.parts.map(part => part.slot)).size, 2, `${option.recipe_id} repeats a slot`);
      for (const part of option.parts) assert.equal(validate(part), null, `${option.recipe_id} ${part.slot}`);
    }
  }
});

test("the first demo choice contrasts the opening with marbles and a rain transformation", () => {
  const options = ambientArsenal({ ...input(), round: 1 });
  assert.deepEqual(new Set(options.map(option => option.recipe_id)), new Set(["ambient-marbles", "ambient-rain-prism"]));
  assert.equal(new Set(options.map(option => option.slot)).size, 2);
  const marbles = options.find(option => option.recipe_id === "ambient-marbles")!;
  const rain = options.find(option => option.recipe_id === "ambient-rain-prism")!;
  assert.match(marbles.parts[0].code, /~t\.\(\\marbles\)/);
  assert.match(marbles.parts[1].code, /\\fxmotion/);
  assert.match(rain.parts[0].code, /\\fxmotion/);
  assert.equal(validate(rain.parts[1]), null);
  assert.doesNotMatch(rain.parts[1].code, /\\instrument, \\(?:vox|choir|porcelain|fm|pluck|gendy|pad)\b/);
});

test("ambient fast round fills two seats before Sonnet returns", async () => {
  const options: Suggestion[] = [], events: Record<string, unknown>[] = [];
  let release!: () => void, modelAngle = "";
  const pending = fastRound([input()], option => options.push(option), (kind, detail) => { if (kind === "composition") events.push(detail); }, async modelInput => {
    modelAngle = modelInput.angle || "";
    await new Promise<void>(resolve => { release = resolve; });
    return [];
  });
  assert.equal(options.length, 2);
  assert.equal(modelAngle, "transform");
  assert.deepEqual(events[0], { completed: 2, total: 3 });
  release(); await pending;
  assert.deepEqual(events.at(-1), { completed: 3, total: 3 });
});

test("a one-part model wildcard is completed locally without touching reserved instant slots", async () => {
  const options: Suggestion[] = [], modelInput = input(0), before = modelInput.slots.d3;
  const modelOption: Suggestion = { slot: "d3", code: '~d.(\\d3, \\instrument, \\rustle, \\delta, Pseq([1, 3, 0.5, 5], inf), \\dur, 1.2, \\freq, 2600, \\amp, 0.04)',
    parts: [{ slot: "d3", code: '~d.(\\d3, \\instrument, \\rustle, \\delta, Pseq([1, 3, 0.5, 5], inf), \\dur, 1.2, \\freq, 2600, \\amp, 0.04)', diff: "new rustle" }],
    why: "Leaves answer the wet foreground.", evidence: "d3 was static", diff: "new rustle", angle: "texture", ms: 5,
    expect: { metric: "density", dir: "up" } };
  assert.notEqual(before, modelOption.code);
  await fastRound([modelInput], option => options.push(option), () => {}, async (_modelInput, onOption) => {
    onOption(modelOption); return [modelOption];
  });
  const wildcard = options.find(option => option.origin === "model")!;
  assert.equal(wildcard.parts.length, 2);
  assert.deepEqual(wildcard.parts.map(part => part.slot), ["d3", "d1"]);
  assert.ok(wildcard.parts.every(part => validate(part) === null));
});

test("tell mode keeps two immediate ambient answers and steers rhythm requests", () => {
  const options = ambientArsenal({ ...input(0), note: "more rhythm and movement in the current sound" });
  assert.equal(options.length, 2);
  assert.ok(options.every(option => /Pseq\(/.test(option.code)));
});

test("tell mode can explicitly call for stochastic highs and lows", () => {
  const options = ambientArsenal({ ...input(7), note: "more random stochastic highs and lows with rhythmic variation" });
  assert.equal(options.length, 2);
  assert.ok(options.some(option => /air-flutter|bird-grain|paper-fall|rain/.test(option.angle)));
  assert.ok(options.some(option => /understone|marbles|droplet|wave/.test(option.angle)));
});

test("ambient powers immediately transform current voices", () => {
  for (const id of ["carve", "fracture", "reveal"]) {
    const options = ambientSkillArsenal({ ...input(2), showcase: id, skills: [id] });
    assert.equal(options.length, 2, id);
    assert.ok(options.every(option => option.evidence.includes("active d")), id);
    assert.ok(options.every(option => /\\fx(?:hp|lp|motion|space|drive)/.test(option.code)), id);
    if (id === "fracture") assert.ok(options.every(option => option.forBars === 2));
    if (id === "reveal") assert.ok(options.every(option => option.transition === "wash"));
  }
});

test("ambient model options reject the ominous synthetic families", async () => {
  for (const instrument of ["gendy", "pad", "fm", "pluck", "porcelain", "choir"]) {
    await assert.rejects(ask({ ...input(2), angle: "transform" }, () => assert.fail(`${instrument} was offered`), () => {}, async () =>
      `SLOT d3 REPLACE\nSET instrument = \\${instrument}\nSET dur = 8\nSET midinote = 80\nEXPECT high up\nWHY sparse high tones hover over the room\nEVIDENCE d3 was static`), /no angle/, instrument);
  }
});

test("clearing removes the continuous low foundation", () => {
  const clearing = AMBIENT_ARSENAL.find(seed => seed.id === "clearing")!;
  assert.equal(clearing.slot, "d4");
  assert.equal(clearing.expect.dir, "down");   // a removal predicts less of something; which band is measured, not guessed
  // its fallback voice is rare warm chords with a heavy rest weight, not Gendy tones alternating a bare tritone
  assert.match(clearing.code, /\\instrument, \\glow/);
  assert.match(clearing.code, /\\delta, Pexprand\(18, 40/);
  assert.match(clearing.code, /\\r, \\r\]/);
});

test("ambient rotation includes quiet organic rhythm and leaves Sonnet a different role", async () => {
  for (const id of ["fingertips", "marbles", "twig-cycle", "pebble-pairs", "leaf-shuffle", "reed-answer"]) {
    const seed = AMBIENT_ARSENAL.find(candidate => candidate.id === id);
    assert.ok(seed, id); assert.match(seed.code, /\\delta/); assert.doesNotMatch(seed.code, /\\(?:kick|hat|clap|snare|rim)\b/);
  }
  // A round whose instant offers carry no rhythm asks the model for the missing role; a round that already has
  // rhythm on the table asks for something else. Which rounds those are depends on the rotation, so find them.
  const ask = async (round: number) => {
    let angle = ""; const offered: string[] = [];
    await fastRound([input(round)], option => offered.push(option.angle), () => {}, async modelInput => { angle = modelInput.angle || ""; return []; });
    return { angle, offered };
  };
  // the host asks for pulse on every fifth round, when nothing on the table carries rhythm
  const rounds = await Promise.all([5, 10, 15, 20, 25, 30].map(ask));
  const quiet = rounds.find(r => !r.offered.some(a => RHYTHMIC.has(a))), busy = rounds.find(r => r.offered.some(a => RHYTHMIC.has(a)));
  assert.ok(quiet && busy, "the rotation should have both kinds of round");
  assert.equal(quiet!.angle, "pulse");
  assert.ok(!quiet!.offered.includes("pulse"));
  assert.notEqual(busy!.angle, "pulse");
});

test("the extremes reach registers and amplitudes the calm gestures never did", () => {
  const get = (id: string) => AMBIENT_ARSENAL.find(seed => seed.id === id)!;
  // a real low that is an event, not a floor: a genuine \sub with gaps measured in tens of beats
  assert.match(get("tide-floor").code, /Pexprand\(21, 38/);
  assert.deepEqual(get("tide-floor").expect, { metric: "sub", dir: "up" });
  // burst then hole: most of the swarm's delta weight is a multi-second gap
  assert.match(get("swarm").code, /Pwrand\(\[0\.125, 0\.1875, 0\.25, Pexprand\(16, 34, 1\)\]/);
  // a real high, and an event so rare the slot is silent most of the time
  assert.match(get("spray").code, /\\hp, 2600/);
  assert.match(get("glint").code, /\\delta, Pexprand\(14, 46, inf\)/);
  // and an option whose whole content is taking something away
  assert.match(get("hollow-out").code, /Pexprand\(24, 48/);   // an event every thirty seconds or so, the rest of the time nothing
  for (const id of ["tide-floor", "spray", "swarm", "thunder-stone", "falling-air", "glint", "hollow-out"])
    assert.equal(validate({ slot: get(id).slot, code: get(id).code }), null, id);
});

test("the tide gives the set an arc: it breaks open, then it hollows out", () => {
  const phases = Array.from({ length: 6 }, (_, round) => ambientTide({ round, history: [] }).phase);
  assert.deepEqual(new Set(phases).size, 6);
  const angles = (round: number) => ambientArsenal(input(round)).map(option => option.angle);
  const at = (phase: string) => { for (let r = 0; r < 12; r++) if (ambientTide({ round: r, history: [] }).phase === phase) return angles(r); return []; };
  // the phase asking for the biggest event gets one; the phase asking for absence gets a subtraction
  assert.ok(at("break").some(angle => ["tide-floor", "swarm", "thunder-stone", "spray"].includes(angle)), at("break").join());
  assert.ok(at("hollow").some(angle => ["hollow-out", "clearing", "open-horizon"].includes(angle)), at("hollow").join());
  // and taking ideas moves the set through the cycle faster than letting them pass
  const taken = [{ slot: "d4", why: "", verdict: "y" as const, recipe_id: "ambient-marbles" }];
  assert.notEqual(ambientTide({ round: 2, history: taken }).phase, ambientTide({ round: 2, history: [] }).phase);
  assert.equal(ambientTide({ round: 2, history: taken }).avoid, "low");
});

test("a contrast listener is handed the extremes, and never two ideas in one register", () => {
  const squall = roster().find(candidate => candidate.id === "squall")!;
  assert.ok(isAmbientDJ(squall));
  assert.match(squall.style, /AMBIENT DISCIPLINE: contrast/);
  assert.ok(/voice|choir/i.test(squall.never.join(" ")));
  let extremes = 0;
  for (let round = 2; round < 10; round++) {
    const options = ambientArsenal({ ...input(round), dj: squall });
    assert.equal(options.length, 2, `round ${round}`);
    if (options.some(option => ["tide-floor", "swarm", "thunder-stone", "spray", "hollow-out", "clearing", "open-horizon"].includes(option.angle))) extremes++;
  }
  assert.ok(extremes >= 6, `only ${extremes} of 8 rounds reached an extreme`);
});

test("ambient mode has four dedicated listeners and excludes club personas", () => {
  const ambient = roster().filter(isAmbientDJ);
  for (const id of ["resident", "river-listener", "mineral-listener", "canopy-listener"])
    assert.ok(ambient.some(candidate => candidate.id === id), id);
  assert.ok(ambient.every(candidate => /voice|choir/i.test(candidate.never.join(" "))));
  assert.ok(!ambient.some(candidate => candidate.id === "acid-reflux"));
});

test("a note the library cannot place gets no instant answer; the model is told to answer the words", async () => {
  const was = process.env.EARS_INSTANT; delete process.env.EARS_INSTANT;
  try {
    const odd = { ...input(3), note: "make it feel like a cathedral at dawn" };
    assert.deepEqual(ambientArsenal(odd), []);
    let angle = ""; const offered: Suggestion[] = [];
    await fastRound([odd], option => offered.push(option), () => {}, async modelInput => { angle = modelInput.angle || ""; return []; });
    assert.equal(offered.length, 0);
    assert.equal(angle, "answer");
    // a note it can place answers at once and says which words it matched
    const synth = ambientArsenal({ ...input(3), note: "stack another synth on top" });
    assert.ok(synth.length >= 1);
    assert.match(synth[0].answers ?? "", /synth/);
    assert.match(synth[0].code, /\\glow/);
  } finally { process.env.EARS_INSTANT = was; }
});

test("listeners are distinct: each has a repertoire, and their instant offers overlap little", () => {
  const listeners = roster().filter(isAmbientDJ);
  const offers = (dj: ReturnType<typeof roster>[number]) => new Set(Array.from({ length: 12 }, (_, i) => ambientArsenal({ ...input(i + 2), dj }, 1)[0]?.angle).filter(Boolean));
  const sets = listeners.map((dj) => [dj.id, offers(dj)] as const);
  for (const [id, set] of sets) assert.ok(set.size >= 5, `${id} offers only ${[...set].join(", ")}`);
  for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
    const shared = [...sets[a][1]].filter((x) => sets[b][1].has(x)).length, smaller = Math.min(sets[a][1].size, sets[b][1].size);
    assert.ok(shared / smaller <= 0.5, `${sets[a][0]} and ${sets[b][0]} share ${shared} of ${smaller}`);
  }
  for (const dj of listeners) { assert.ok(dj.signature.length >= 6, dj.id); assert.ok(dj.signature.includes(dj.entrance), `${dj.id}: entrance is in its repertoire`); assert.ok(AMBIENT_ARSENAL.some((g) => g.id === dj.entrance), dj.id); }
});

test("a listener walks in with its calling card first", () => {
  const dj = roster().find((d) => d.id === "canopy-listener")!;
  const round = ambientArsenal({ ...input(4), dj, entrance: dj.entrance }, 1);
  assert.equal(round[0].angle, dj.entrance);
  assert.match(round[0].why, /calling card/);
  // and not on later rounds
  assert.notEqual(ambientArsenal({ ...input(4), dj }, 1)[0].why.includes("calling card"), true);
});

test("every prediction is measured: the metric a gesture moves most over the base, with its strength recorded", () => {
  for (const seed of AMBIENT_ARSENAL) {
    const m = MEASURED[seed.id];
    assert.ok(m, `${seed.id} has no measurement`);
    assert.deepEqual(seed.expect, { metric: m.metric, dir: m.dir }, seed.id);
  }
  // most gestures clear the floor: a round is usually checkable
  assert.ok(AMBIENT_ARSENAL.filter((seed) => MEASURED[seed.id].strength >= 1.5).length >= AMBIENT_ARSENAL.length / 2);
});
