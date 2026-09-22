import test from "node:test";
import assert from "node:assert/strict";
import { developMoment, inspirationPrompt, developmentStatus, DEVELOP } from "../inspiration.ts";
import type { Moment } from "../moments.ts";
import { ask, type AskInput } from "../agent.ts";
import { parse } from "../djs.ts";

const saved = '~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([36, 43, 48, 43], inf))';
const current = '~d.(\\d4, \\instrument, \\pluck, \\dur, 1/2, \\midinote, 50, \\send, 0.3)';
function moment(context: Record<string, unknown> = {}): Moment {
  return { version: 1, id: "saved-1", label: "kept · bar 12", favorite: true, session_id: "old-session", saved_at: 100,
    clip: { path: "/unused.wav", uri: "file:///unused.wav", sha256: "unused", channels: 2, tap: "post-master/pre-volume", frames: 1, sample_rate: 48000, start_ms: 0, end_ms: 1 },
    context_at_request: { slots: { d4: saved }, tempo: 110, key: "C major", ...context }, state_at_window_start: null,
    events: [], observation_ids: [], execution_ids: [], timing_basis: "engine_clock_estimate", timing_uncertainty_ms: null, attribution: "unverified" };
}

test("favourite development prefers an active snapshot without merging pending source into it", () => {
  const m = moment({ active_slots: { d4: saved }, slots: { d4: current, d5: '~d.(\\d5, \\instrument, \\pad)' } });
  const reference = developMoment(m, "answer");
  assert.deepEqual(reference.slots, { d4: saved });
  assert.equal(reference.source_basis, "active source at capture request");
  (m.context_at_request.active_slots as Record<string, string>).d4 = current;
  assert.equal(reference.slots.d4, saved, "reference is detached from mutable capture context");
});

test("old submitted snapshots remain usable but never claim activation or audio extraction", () => {
  const reference = developMoment(moment(), "rhythm"), prompt = inspirationPrompt(reference);
  assert.match(reference.source_basis, /submitted.*unverified/);
  assert.match(prompt, /NOT heard this clip/);
  assert.match(prompt, /110/);
  assert.match(prompt, /C major/);
  assert.match(prompt, /CURRENT CODE/);
});

test("preceding snapshots retain their own tempo and mixed windows remain explicit", () => {
  const m = moment({ slots: {}, tempo: 150 });
  m.state_at_window_start = { v: 0, type: "state", from: "host", t: 0, bar: 1, active_slots: { d4: saved }, tempo: 110, key: "C major" };
  m.events = [{ v: 0, type: "transition", from: "host", t: 1, bar: 2 }];
  const reference = developMoment(m, "transform");
  assert.match(reference.context, /110/);
  assert.equal(reference.mixed_window, true);
  assert.match(inspirationPrompt(reference), /overlaps a change/);
});

test("empty or malformed source cannot silently become a generic develop request", () => {
  for (const slots of [{}, { d4: "not a pattern" }, { d4: '~d.(\\d5, \\instrument, \\bass)' }, { d7: saved }, { d4: saved + " ".repeat(1200) }]) {
    assert.throws(() => developMoment(moment({ slots }), "answer"), /no saved pattern source/);
  }
  assert.equal(inspirationPrompt(null), "");
});

test("each development intention produces a distinct request from the same saved source", () => {
  const prompts = Object.keys(DEVELOP).map(intent => inspirationPrompt(developMoment(moment(), intent as keyof typeof DEVELOP)));
  assert.equal(new Set(prompts).size, 3);
  prompts.forEach(prompt => assert.ok(prompt.includes(saved)));
});

const dj = parse("---\nname: TEST DJ\n---\n# Style\nHouse\n# Idioms\n- syncopation\n# Never\n- abandon the pulse", "test")!;
const input: AskInput = { dj, angle: "hook", slots: { d4: current }, context: "128 BPM, D minor", report: "", note: "Keep the kick steady", history: [] };

test("a developed proposal patches the live set and carries its reference into the log", async () => {
  const reference = developMoment(moment(), "answer"), events: Record<string, unknown>[] = [];
  const options = await ask({ ...input, inspiration: reference }, () => {}, (_kind, detail) => events.push(detail), async prompt => {
    assert.ok(prompt.includes(saved) && prompt.includes(current));
    assert.ok(prompt.includes("128 BPM, D minor") && prompt.includes("110"));
    assert.ok(prompt.includes(input.note));
    return "SLOT d4\nSET midinote = Pseq([50, 57, 62, 57], inf)\nEXPECT density same\nWHY The kept bass contour answers in a higher plucked register\nEVIDENCE saved d4 rising fourth and octave";
  });
  assert.equal(options[0].inspiration_id, "saved-1");
  assert.equal(events[0].inspiration_id, "saved-1");
  assert.match(options[0].code, /\\instrument, \\pluck/);
  assert.match(options[0].code, /\\send, 0.3/);
  assert.equal(input.slots.d4, current, "generation must not alter live source");
});

test("a favourite request cannot qualify as a simple gain cut even in repair mode", async () => {
  await assert.rejects(ask({ ...input, angle: "fix", inspiration: developMoment(moment(), "rhythm") }, () => {}, () => {},
    async () => "SLOT d4\nSET amp = 0.1\nEXPECT loudness down\nWHY softer"), /no angle/);
});

test("favourite generation gets a longer deadline than ordinary rounds", async () => {
  const deadlines: number[] = [];
  const generate = async (_prompt: string, _system: string, timeout: number) => {
    deadlines.push(timeout);
    return "SLOT d4\nSET midinote = Pseq([50, 57, 62, 57], inf)\nEXPECT density same\nWHY answer the kept contour";
  };
  await ask(input, () => {}, () => {}, generate);
  await ask({ ...input, inspiration: developMoment(moment(), "answer") }, () => {}, () => {}, generate);
  if (!process.env.EARS_DEADLINE) {
    assert.equal(deadlines[0], 45000);
    assert.equal(deadlines[1], 60000);
  }
});

const idle = { busy: false, startedAt: 1000, now: 1000, options: 0, hasReport: true, localDjs: 1, error: "", autoTake: false };
test("favourite status follows request and proposal progress rather than staying on developing", () => {
  assert.equal(developmentStatus(idle), "reference selected · a asks for ideas");
  assert.equal(developmentStatus({ ...idle, busy: true, now: 13000 }), "DJs working · 12s");
  assert.equal(developmentStatus({ ...idle, busy: true, options: 1 }), "1 idea ready · 1 take");
  assert.equal(developmentStatus({ ...idle, options: 3 }), "3 ideas ready · 1/2/3 take");
});
test("empty failed rounds show the actual refusal with a retry action", () => {
  assert.equal(developmentStatus({ ...idle, error: "no answer within 30s" }), "no ideas: no answer within 30s · a retry");
  assert.equal(developmentStatus({ ...idle, error: "bad patch", options: 1 }), "1 idea ready · 1 take");
});
test("blocked requests and automatic taking are identified explicitly", () => {
  assert.equal(developmentStatus({ ...idle, hasReport: false }), "waiting for listening report");
  assert.equal(developmentStatus({ ...idle, localDjs: 0 }), "no local DJ · d brings one in");
  assert.equal(developmentStatus({ ...idle, options: 1, autoTake: true }), "1 idea ready · auto armed · n veto");
});
