import test from "node:test";
import assert from "node:assert/strict";
import { suggestionRound } from "../suggestion-round.ts";
import type { AskInput, Suggestion } from "../agent.ts";
import { parse } from "../djs.ts";

const input: AskInput = { dj: parse("---\nname: TEST\n---\n# Style\nHouse", "test")!, slots: {}, context: "126 BPM", report: "", note: "make space", history: [] };
const option = (slot: string): Suggestion => ({ slot, code: slot, parts: [{ slot, code: slot, diff: slot }], diff: slot, why: slot, evidence: "source", angle: "hook", ms: 0, expect: { metric: "density", dir: "same" } });

test("all three seats wait for composition and receive different musical briefs", async () => {
  const release: (() => void)[] = [], angles: string[] = [], seen: Suggestion[] = [];
  const pending = suggestionRound([input], o => seen.push(o), () => {}, async (request, offer) => {
    angles.push(request.angle!);
    assert.equal(request.note, "make space");
    await new Promise<void>(resolve => release.push(resolve));
    const o = option(request.angle!); offer(o); return [o];
  });
  assert.deepEqual(angles, ["groove", "hook", "turn"]);
  assert.deepEqual(seen, [], "no instant recipe may appear before a model responds");
  release.forEach(resolve => resolve()); await pending;
  assert.equal(seen.length, 3);
  assert.ok(seen.every(o => o.origin === "model"));
});

test("a cancelled round cannot surface late answers", async () => {
  const controller = new AbortController(), release: (() => void)[] = [];
  const pending = suggestionRound([{ ...input, signal: controller.signal }], () => assert.fail("late answer"), () => {}, async (_request, offer) => {
    await new Promise<void>(resolve => release.push(resolve));
    const o = option("d2"); offer(o); return [o];
  });
  controller.abort(); release.forEach(resolve => resolve()); await pending;
});

test("one failed composer leaves valid ideas available, and duplicate moves occupy only one seat", async () => {
  const offered: Suggestion[] = [];
  await suggestionRound([input], o => offered.push(o), () => {}, async (request, offer) => {
    if (request.angle === "turn") throw new Error("unavailable");
    const o = option("d2"); offer(o); return [o];
  });
  assert.equal(offered.length, 1);
  await assert.rejects(suggestionRound([input], () => {}, () => {}, async () => { throw new Error("composer failed"); }), /composer failed/);
});
