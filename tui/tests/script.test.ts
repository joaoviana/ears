import test from "node:test";
import assert from "node:assert/strict";
import { BEATS, script, beatOf, plain, live, predicts, measured, sections, STEPS, type Part, type Context } from "../script.ts";
import type { Msg } from "../bus.ts";

const at = (t: number, type: string, body: Record<string, unknown> = {}): Msg => ({ v: 0, t, bar: 0, type, from: "host", ...body });
const sea = '~d.(\\d1, \\instrument, \\nature, \\buf, ~n.(\\waves), \\dur, 32, \\amp, 0.3)';
const marbles = '~d.(\\d4, \\instrument, \\texture, \\buf, ~t.(\\marbles), \\delta, Pseq([1.5, 0.6], inf), \\amp, 0.1)';
const rain = '~d.(\\d2, \\instrument, \\nature, \\buf, ~n.(\\rain), \\delta, 24, \\amp, 0.1, \\fxlp, 3000)';
const rainMoved = '~d.(\\d2, \\instrument, \\nature, \\buf, ~n.(\\rain), \\delta, Pseq([1, 3], inf), \\amp, 0.1, \\fxlp, 900, \\fxmotion, 0.9)';
const organ = '~d.(\\d5, \\instrument, \\glow, \\midinote, [50, 57, 64], \\saw, 0.8)';
const ctx: Context = {
  options: [{ n: 1, parts: [{ slot: "d5", before: "", after: organ }, { slot: "d2", before: rain, after: rainMoved }], why: "the glow becomes a wide saw organ; rain answers.", expect: "mid ↑", origin: "recipe", agent: "the resident" },
    { n: 2, parts: [{ slot: "d4", before: sea.replace("d1", "d4"), after: marbles }], why: "marbles roll across wood.", expect: "low ↑", origin: "recipe", agent: "the resident" },
    { n: 3, parts: [{ slot: "d6", before: marbles.replace("d4", "d6"), after: "" }], why: "silence where the marbles were.", expect: "loudness ↓", origin: "model", agent: "the resident", ms: 5800 }],
  change: { parts: [{ slot: "d4", after: marbles, keys: [{ key: "instrument", before: "\\nature", after: "\\texture" }, { key: "buf", before: "~n.(\\waves)", after: "~t.(\\marbles)" }] }], why: "marbles roll across wood.", who: "the resident" },
  grade: { who: "the resident", call: "low ↑", text: "low +3.1 dB", grade: "hit" },
  booth: ["the resident", "canopy listener"], active: "the resident", note: "more saws",
};

test("every beat is short, tagged, complete, and talks about what is really on screen", () => {
  const sample = at(1, "x", { agent: "canopy listener", name: "canopy listener", skill: "fracture", reason: "too long", kind: "wash", text: "more saws" });
  const parts = new Set<Part>();
  for (const b of BEATS) {
    const lines = b.say(sample, ctx);
    assert.ok(lines.length >= 1, b.id);
    assert.match(b.then, /^[A-Z].*\.$/, `${b.id}: 'then' is an instruction`);
    if (b.todo) assert.match(b.todo, /^[a-z]/, `${b.id}: 'todo' is a move`);
    for (const line of lines) {
      assert.ok(line.text.split(" ").length <= 34, `${b.id}: too long: ${line.text}`);
      assert.doesNotMatch(line.text, /\bundefined\b|\bnull\b|\[object/, `${b.id}: ${line.text}`);
      assert.match(line.text, /[.!?"]$/, `${b.id}: ends a sentence: ${line.text}`);
      parts.add(line.part);
    }
    // a beat renders with nothing known, too: an empty room must not crash or leak placeholders
    for (const line of b.say(null, {})) assert.doesNotMatch(line.text, /\bundefined\b|\bnull\b/, `${b.id}: ${line.text}`);
  }
  assert.deepEqual([...parts].sort(), ["claude", "djs", "protocol", "sc", "sound"]);
  assert.equal(new Set(BEATS.map((b) => b.id)).size, BEATS.length);
  const say = (id: string) => BEATS.find((b) => b.id === id)!.say(null, ctx).map((l) => l.text).join("\n");
  // the ideas beat names every option on the table and says where each came from; it never repeats the card's own words
  for (const o of ctx.options!) assert.match(say("proposal"), new RegExp(`^${o.n}: `, "m"));
  assert.match(say("proposal"), /library/); assert.match(say("proposal"), /Claude Code/);
  assert.doesNotMatch(say("proposal"), /wide saw organ/);
  // the take and playing beats describe the change that landed, the grade beat quotes the guess, the meter and the mark
  for (const id of ["take", "active"]) assert.match(say(id), /glass marbles/, id);
  for (const needle of ["bring up the bass", "3.1 dB", "✓ Correct"]) assert.ok(say("graded").includes(needle), needle);
  assert.doesNotMatch(say("graded") + say("proposal"), /\bcalls\b|\bmark(ed)?\b|\bguess|\bpredict/, "no jargon: an idea says what it will do; a meter checks");
  assert.match(say("open"), /meter listens to the output/, "the opening explains what is measured before any check");
  assert.match(say("proposal"), /a meter checks/, "the ideas beat says a check is coming");
  for (const name of ctx.booth!) assert.ok(say("open").includes(name), name);
});

test("a prediction is said in words", () => {
  assert.match(predicts("low ↑"), /^bring up the bass$/); assert.match(predicts("air ↓"), /^bring down the very top/); assert.match(predicts("brightness ="), /leave the brightness alone/);
  assert.equal(measured("-0.5 dB: inside the noise (±1.2)", "flat"), "it moved down by 0.5 dB, less than the music's own wobble of 1.2. ○ No real change.");
  assert.equal(measured("+3.1 dB", "hit"), "it went up by 3.1 dB. ✓ Correct.");
  assert.equal(measured("+0.0 dB: inside the noise (±2.4)", "flat"), "it did not move at all (the music itself wobbles by 2.4). ○ No real change.");
  const quiet = sections({ lastCheck: { who: "x", call: "air ↑", text: "+0.0 dB", grade: "flat" }, listeners: [{ name: "x", active: true, taken: 2, offered: 2, right: 0, wrong: 0, flat: 2, powers: [] }] })[4];
  assert.match(quiet.say, /not a fail/); assert.match(quiet.say, /bolder/);
  // the live sentence counts down to what happens next, and names the idea
  const w: Msg[] = [at(1, "proposal", { id: 4, slot: "d6" }), at(2, "verdict", { proposal: 4, decision: "take", by: "human" }), at(3, "applied", { proposal: 4 })];
  assert.match(live(w, { nextBarMs: 1840 }, 5000).now, /Written #4 in d6\. Lands on the next bar in 1\.8s/);
  w.push(at(4, "active", { proposal: 4 }));
  assert.match(live(w, { nextReportMs: 5200 }, 5000).now, /Playing #4 in d6\. Meter reports in 5\.2s, then the verdict/);
  assert.equal(measured("-2.4 dB", "miss"), "it went down by 2.4 dB, the other way. ✗ Wrong.");
});

test("a change is described by what it does to the sound", () => {
  assert.match(plain({ slot: "d4", before: sea, after: marbles }), /^swaps the sea in d4 for glass marbles$/);
  assert.match(plain({ slot: "d5", before: "", after: organ }), /^adds a warm chord in d5$/);
  assert.match(plain({ slot: "d6", before: marbles, after: "" }), /^removes glass marbles from d6$/);
  assert.match(plain({ slot: "d2", before: rain, after: rainMoved }), /^changes rain's timing and tone in d2$/);
  // a landed transform records only the keys it moved; the instrument is read from the code that landed
  assert.match(plain({ slot: "d3", after: rain.replace("rain", "birds"), keys: [{ key: "fxlp", before: "3000", after: "900" }] }), /^changes birds' tone in d3$/);
});

test("the script follows the wire: the newest message with a beat is the one to read, and it stays until the next", () => {
  const wire: Msg[] = [at(1, "hello"), at(2, "state")];
  let s = script(wire);
  assert.equal(s.current.id, "open");
  assert.equal(s.since, null);
  wire.push(at(10, "proposal", { id: 1, expect: { metric: "low", dir: "up" } }));
  assert.equal(script(wire).current.id, "proposal");
  wire.push(at(20, "state"), at(21, "observation"), at(22, "note", { from: "jev", text: "review" }));   // traffic that is not a beat
  assert.equal(script(wire).current.id, "proposal");
  assert.equal(script(wire).since, 10);
  // taking #1 retires the other ideas with host skips a moment later; the beat is the take, not a skip
  wire.push(at(30, "verdict", { proposal: 1, decision: "take", by: "human" }), at(31, "verdict", { proposal: 2, decision: "skip", by: "host" }));
  s = script(wire);
  assert.equal(s.current.id, "take");
  assert.ok(!s.shown.has("skip"));
  wire.push(at(40, "applied"), at(41, "evaluated"), at(42, "active"));
  assert.equal(script(wire).current.id, "active");
  wire.push(at(50, "outcome", { grade: "ungraded", reason: "another change landed at the same time" }));
  assert.equal(script(wire).current.id, "graded", "an unchecked result is still a result, with its reason");
  assert.ok(script(wire).current.say(wire.at(-1)!, {}).some((l) => l.text.includes("another change landed at the same time")));
  wire.push(at(51, "outcome", { grade: "hit" }));
  s = script(wire);
  assert.equal(s.current.id, "graded");
  assert.equal(s.message?.t, 51);
  assert.deepEqual([...s.shown].sort(), ["active", "graded", "open", "proposal", "take"]);
  assert.ok(s.remaining.every((b) => !s.shown.has(b.id)));
});

test("listeners walking in and out, grants, unlocks, guests and the wire each have their own beat", () => {
  const wire: Msg[] = [];
  assert.equal(beatOf(at(1, "unlock", { skill: "fracture" }), wire)?.id, "unlock");
  assert.equal(beatOf(at(2, "grant", { skill: "fracture" }), wire)?.id, "power");
  assert.equal(beatOf(at(3, "grant", { level: "auto" }), wire)?.id, "takeover");
  assert.equal(beatOf(at(4, "grant", { level: "suggest" }), wire), null);
  assert.equal(beatOf(at(5, "enter", { agent: "g", remote: true }), wire)?.id, "guest");
  assert.equal(beatOf(at(6, "enter", { agent: "canopy-listener", name: "Canopy Listener" }), wire)?.id, "enter");
  assert.equal(beatOf(at(7, "leave", { agent: "canopy-listener" }), wire)?.id, "leave");
  assert.equal(beatOf(at(8, "rejected", { reason: "x" }), wire)?.id, "refused");
  assert.equal(beatOf(at(9, "note", { from: "human", text: "more rhythm" }), wire)?.id, "note");
  assert.equal(script([at(10, "proposal", { id: 1 })], { wireOpen: true }).current.id, "wire");
  // a listener leaving withdraws its ideas with host skips: those are not a "you skipped" beat
  const leaving = [at(20, "leave", { agent: "x" }), at(21, "verdict", { decision: "skip", by: "host" })];
  assert.equal(script(leaving).current.id, "leave");
  // walking in starts a round at once; the arrival holds the script against the ideas that follow it
  const arriving = [at(100, "enter", { agent: "canopy-listener", name: "Canopy Listener" }), at(900, "proposal", { id: 4 }), at(950, "rejected", { reason: "x" })];
  assert.equal(script(arriving).current.id, "enter");
  assert.equal(script([...arriving, at(100 + 13000, "proposal", { id: 5 })]).current.id, "proposal", "the hold ends");
  // a refusal beside fresh ideas does not take the script away from the ideas
  assert.equal(script([at(200, "proposal", { id: 6 }), at(300, "rejected", { reason: "x" })]).current.id, "proposal");
  // but a take after the arrival is a real new beat
  assert.equal(script([...arriving, at(1000, "verdict", { decision: "take", by: "human" })]).current.id, "take");
});

test("the live strip fills in step by step as the protocol moves, and says what is happening in one sentence", () => {
  const wire: Msg[] = [at(1, "state"), at(2, "observation")];
  const states = (c: Context = {}) => live(wire, c, 90000).steps.map((x) => x.state).join(" ");
  assert.equal(states(), "todo todo todo todo todo todo");
  assert.match(live(wire, {}, 5000).now, /^Listening/);
  assert.match(live(wire, { thinking: "composing · 4s" }, 5000).now, /Claude Code/);
  wire.push(at(10, "proposal", { id: 1 }));
  assert.equal(states({ ideas: 2 }), "now todo todo todo todo todo");
  assert.match(live(wire, { ideas: 2 }, 5000).now, /2 ideas/);
  wire.push(at(20, "verdict", { proposal: 1, decision: "take", by: "human" }));
  assert.equal(states(), "done now todo todo todo todo");
  assert.notEqual(live(wire, {}, 5000).now, live(wire.slice(0, -1), {}, 5000).now, "a take changes the sentence");
  wire.push(at(21, "applied", { proposal: 1 }), at(22, "evaluated", { proposal: 1 }));
  assert.equal(states(), "done done now todo todo todo");
  
  wire.push(at(30, "active", { proposal: 1 }));
  assert.equal(states(), "done done done now todo todo");
  wire.push(at(40, "comparison", { proposal: 1 }));
  assert.equal(states(), "done done done done now todo");
  wire.push(at(41, "outcome", { grade: "hit", proposal: 1 }));
  assert.equal(states(), "done done done done done done");
  
  // a skip ends the loop at the decision
  wire.push(at(50000, "proposal", { id: 2 }), at(51000, "verdict", { proposal: 2, decision: "skip", by: "human" }));
  assert.equal(states(), "done done todo todo todo todo");
  
  assert.equal(STEPS.length, 6);
  // the app can hold the display back a step: the truth is "play", the strip shows "write" for a moment
  const held = live([at(1, "state"), at(2, "proposal", { id: 3 }), at(3, "verdict", { proposal: 3, decision: "take", by: "human" }), at(4, "applied", { proposal: 3 }), at(5, "active", { proposal: 3 })], { showStep: 2 }, 9000);
  assert.equal(held.steps.map((x) => x.state).join(" "), "done done now todo todo todo");
  assert.match(held.now, /^Written/);
});

test("the components are always on screen: each has live state and one thing to say, and the last check stays put", () => {
  const empty = sections({});
  assert.deepEqual(empty.map((x) => x.label), ["PICTURE", "SOUND", "LISTENERS", "IDEAS", "VERDICT"]);
  for (const sec of empty) { assert.ok(sec.status.length > 0 && sec.say.length > 20 && sec.say.length <= 130, sec.label); assert.doesNotMatch(sec.status + sec.say, /undefined|null|NaN/, sec.label); }
  const full = sections({ ...ctx, look: "orbit", palette: "ember", playing: [{ slots: ["d1", "d2"], inst: "nature" }, { slots: ["d5"], inst: "glow" }],
    listeners: [{ name: "the resident", active: true, taken: 3, offered: 5, right: 2, wrong: 1, flat: 0, powers: ["◒"] }, { name: "canopy listener", active: false, taken: 0, offered: 1, right: 0, wrong: 0, flat: 0, powers: [], auto: true }],
    lastCheck: { who: "the resident", call: "low ↑", text: "low +3.1 dB", grade: "hit" } });
  const by = Object.fromEntries(full.map((x) => [x.label, x]));
  by["LAST CHECK"] = by.VERDICT;
  assert.match(by.SOUND.status, /d1 d2 field recording · d5 warm chord/);
  assert.match(by.LISTENERS.status, /▸ the resident: 3\/5 taken, 2 right 1 wrong, powers ◒/);
  assert.match(by.LISTENERS.status, /canopy listener \(acting alone\): 0\/1 taken/);
  assert.match(by.IDEAS.status, /^1 .*\(instant\)  ·  2 .*\(instant\)  ·  3 .*\(Claude Code\)$/);
  assert.match(by["LAST CHECK"].status, /said this would bring up the bass\. The meter says it went up by 3\.1 dB\. ✓ Correct\./);
  const unchecked = sections({ lastCheck: { who: "the resident", call: "high ↑", grade: "ungraded", reason: "another change landed at the same time" } });
  assert.match(unchecked[4].status, /\? Not judged: another change landed at the same time/);
  // every verdict comes with the case for it: why a ✗ or a ○ is the protocol working
  for (const g of ["hit", "miss", "flat", "ungraded"]) assert.ok(sections({ lastCheck: { who: "x", call: "low ↑", text: "+1 dB", grade: g } })[4].say.length > 40, g);
  assert.match(full[4].status, /so far 2 ✓ 1 ✗ 0 ○/);
  assert.match(sections({ thinking: "composing · 7s" })[3].status, /Claude Code is writing \(7s\)/);
});

test("explanations are said once: every beat keeps at least one line of fact when its once-lines are dropped", () => {
  for (const b of BEATS) {
    const lines = b.say(at(1, "x", { agent: "a", name: "A", skill: "carve", reason: "r", kind: "wash", text: "t" }), ctx);
    assert.ok(lines.some((l) => !l.once), `${b.id}: nothing left after the first time`);
  }
});
