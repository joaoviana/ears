import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { ConversationRound, musicalQuestion } from "../conversation.ts";
import { parse } from "../djs.ts";
import type { AskInput, Suggestion } from "../agent.ts";

const input: AskInput = { dj: parse("---\nname: TEST\n---\n# Style\nHouse", "test")!, slots: { d1: "kick", d5: "chords" }, context: "126 BPM", report: "", note: "", history: [] };
const option = (angle: string): Suggestion => ({ slot: "d5", code: angle, parts: [{ slot: "d5", code: angle, diff: angle }], diff: angle, why: angle, evidence: "source", angle, ms: 0, expect: { metric: "density", dir: "same" } });

test("a question is immediate; composition starts before the answer but cannot offer anything yet", async () => {
  const offered: Suggestion[] = [], requests: AskInput[] = [];
  const round = new ConversationRound(input, o => offered.push(o), () => {}, async (request, offer) => {
    requests.push(request); const o = option(request.angle!); offer(o); return [o];
  });
  assert.equal(round.question.text, "Keep this groove or reshape it?");
  await setImmediate();
  assert.equal(requests.length, 2);
  assert.deepEqual(offered, []);
  assert.equal(round.choose(0), true);
  assert.equal(offered[0].angle, "hook", "prepared answer is available synchronously on selection");
  assert.equal(offered[0].origin, "model");
  assert.match(requests[0].note, /Keep the existing drum and bass groove intact/);
  assert.equal(round.choose(1), false, "a second keypress must not replace the selected answer");
  await round.done;
});

test("choosing early reuses the in-flight request and cancels the other branch", async () => {
  const requests: AskInput[] = [], offers: ((o: Suggestion) => void)[] = [], releases: (() => void)[] = [], seen: string[] = [];
  const round = new ConversationRound(input, o => seen.push(o.angle), () => {}, async (request, offer) => {
    requests.push(request); offers.push(offer);
    await new Promise<void>(resolve => releases.push(resolve)); return [];
  });
  await setImmediate();
  round.choose(1);
  assert.equal(requests.length, 2, "answering must not launch another request");
  assert.equal(requests[0].signal!.aborted, true);
  assert.equal(requests[1].signal!.aborted, false);
  offers[0](option("hook"));
  assert.deepEqual(seen, []);
  offers[1](option("groove"));
  await round.done;
  assert.deepEqual(seen, ["groove"]);
  releases.forEach(release => release());
});

test("an immediate answer starts only the chosen composer", async () => {
  const requests: string[] = [];
  const round = new ConversationRound(input, () => {}, () => {}, async (request, offer) => {
    requests.push(request.angle!); offer(option(request.angle!)); return [];
  });
  round.choose(0); await round.done;
  assert.deepEqual(requests, ["hook"]);
});

test("a changed brief cancels every branch, including buffered and late answers", async () => {
  const controller = new AbortController(), offers: ((o: Suggestion) => void)[] = [];
  const round = new ConversationRound({ ...input, signal: controller.signal }, () => assert.fail("obsolete proposal"), () => {}, async (_request, offer) => {
    offers.push(offer); offer(option("buffered")); return [];
  });
  await setImmediate(); controller.abort(); await round.done;
  offers.forEach(offer => offer(option("late")));
  assert.equal(round.choose(0), false);
});

test("a failed chosen branch reports failure instead of substituting the other direction", async () => {
  const round = new ConversationRound(input, () => assert.fail("wrong direction"), () => {}, async (request, offer) => {
    if (request.angle === "hook") throw new Error("composer unavailable");
    offer(option("groove")); return [];
  });
  const rejected = assert.rejects(round.done, /composer unavailable/);
  await setImmediate(); round.choose(0); await rejected;
});

test("a recently accepted drum move leads to a phrasing question, not a question based on a skipped idea", () => {
  const question = musicalQuestion({ ...input, history: [
    { slot: "d2", why: "offbeat", verdict: "y" }, { slot: "d6", why: "lead", verdict: "n" },
  ] });
  assert.match(question.text, /melody/);
  assert.deepEqual(question.answers.map(answer => answer.label), ["Bring it forward", "Leave more space"]);
});
