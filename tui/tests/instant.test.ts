import test from "node:test";
import assert from "node:assert/strict";
import { instantVariations, simpleNotes } from "../instant.ts";
import { fastRound } from "../fast-round.ts";
import { makeBase, STYLE_NAMES } from "../seed.ts";
import { parse } from "../djs.ts";
import { parseSlot } from "../patch.ts";
import { validate, type AskInput, type Suggestion } from "../agent.ts";
import { developMoment } from "../inspiration.ts";

// These rounds were written for the two-instant-seat layout; the default is now one instant seat then the model.
process.env.EARS_INSTANT = "2";

const dj = parse("---\nname: TEST\n---\n# Style\nHouse\n# Idioms\n- rhythm\n# Never\n- abandon the pulse", "test")!;
const input = (seed = 4821): AskInput => ({ dj, slots: makeBase(seed, "vibey", "boogie").slots, context: "", note: "", history: [], report: "" });
const props = (code: string) => Object.fromEntries(parseSlot(code).map(x => [x.key, x.value]));

test("instant moves preserve timing, levels, sample bindings and the kick across live styles", () => {
  for (const style of STYLE_NAMES.filter(style => style !== "ambient")) for (let seed = 0; seed < 20; seed++) {
    const i = { ...input(seed), slots: makeBase(seed, "vibey", style).slots }, snapshot = structuredClone(i.slots);
    const options = instantVariations(i);
    assert.equal(options.length, 2, `${style} ${seed}`);
    for (const o of options) {
      assert.equal(o.origin, "recipe"); assert.notEqual(o.slot, "d1"); assert.equal(validate(o), null);
      const a = props(i.slots[o.slot]), b = props(o.code);
      for (const key of ["dur", "instrument", "ctranspose", "cutoff", "send", "rootfreq"]) assert.equal(b[key], a[key]);
      if (o.recipe_id?.startsWith("accent")) assert.equal(b.amp.replace(/"[Xx-]+"/g, '"row"'), a.amp.replace(/"[Xx-]+"/g, '"row"'));
      else assert.equal(b.amp, a.amp);
      if (a.instrument === "\\keys") assert.equal(b.buf, "~kf");
    }
    assert.deepEqual(i.slots, snapshot);
  }
});

test("unsupported expressions are declined, never executed or guessed", () => {
  assert.equal(simpleNotes("Pfunc { 60.rand }"), null);
  assert.equal(simpleNotes("Pseq([[60,64],[67,72]], inf)"), null);
  assert.equal(simpleNotes("Pseq([60, systemCmd], inf)"), null);
  assert.deepEqual(instantVariations({ ...input(), slots: { d4: '~d.(\\d4, \\midinote, Pfunc { 60.rand })' } }), []);
});

test("freeform performer instructions and showcases stay with the model", () => {
  assert.deepEqual(instantVariations({ ...input(), note: "no rhythm changes" }), []);
  assert.deepEqual(instantVariations({ ...input(), showcase: "carve" }), []);
});

test("favourite rhythm recipes use saved rows without restoring old instruments", () => {
  const i = input(), inspiration = developMoment({ id: "saved", label: "test", context_at_request: { slots: { d2: '~d.(\\d2, \\instrument, \\hat, \\amp, ~x.("X-------X-------", 0.1))' } }, events: [] } as any, "rhythm");
  const options = instantVariations({ ...i, inspiration });
  assert.ok(options.length);
  for (const o of options) { assert.equal(o.inspiration_id, "saved"); assert.equal(props(o.code).instrument, props(i.slots[o.slot]).instrument); }
});

test("two options arrive before the sole model request resolves; abort drops its late answer", async () => {
  const controller = new AbortController(), options: Suggestion[] = []; let resolve!: (value: Suggestion[]) => void, calls = 0;
  const pending = fastRound([{ ...input(), signal: controller.signal }], o => options.push(o), () => {}, async (_i, offer) => {
    calls++; const value = await new Promise<Suggestion[]>(r => { resolve = r; }); value.forEach(offer); return value;
  });
  assert.equal(options.length, 2); assert.equal(calls, 1);
  controller.abort(); resolve([{ ...options[0], code: "late", origin: "model" }]); await pending;
  assert.equal(options.length, 2);
});

test("by default a round is one instant seat and then the model", async () => {
  const was = process.env.EARS_INSTANT; delete process.env.EARS_INSTANT;
  try {
    const options: Suggestion[] = [], events: Record<string, unknown>[] = [];
    await fastRound([input()], o => options.push(o), (kind, detail) => { if (kind === "composition") events.push(detail); }, async () => []);
    assert.equal(options.length, 1);
    assert.deepEqual(events[0], { completed: 1, total: 2 });
    assert.deepEqual(events.at(-1), { completed: 2, total: 2 });
  } finally { process.env.EARS_INSTANT = was; }
});

test("a failed wildcard leaves the instant options usable", async () => {
  const options: Suggestion[] = [];
  await fastRound([input()], o => options.push(o), () => {}, async () => { throw new Error("model timed out"); });
  assert.equal(options.length, 2);
});
