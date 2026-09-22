import test from "node:test";
import assert from "node:assert/strict";
import { reviewCandidates, rankCandidates, type Candidate, type JevReview } from "../jev.ts";
import { suggestionRound } from "../suggestion-round.ts";
import type { AskInput } from "../agent.ts";
import { parse } from "../djs.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadJevApiKey } from "../jev.ts";

const input: AskInput = { dj: parse("---\nname: TEST\n---\n# Style\nHouse", "test")!, slots: {}, context: "126 BPM", report: "", note: "make space", history: [] };
const candidate = (slot: string): Candidate => ({ agent: "test", option: { slot, code: slot, parts: [{ slot, code: slot, diff: slot }], diff: slot, why: slot, evidence: "source", angle: "hook", ms: 0, expect: { metric: "density", dir: "same" } } });
const candidates = [candidate("d2"), candidate("d3"), candidate("d4")];
const review: JevReview = { model: "test", candidates: [
  { index: 0, intent: { score: 1, confidence: 0.9 }, development: { score: 1, confidence: 0.9 } },
  { index: 1, intent: { score: 0, confidence: 0.2 }, development: { score: 0, confidence: 0.2 } },
  { index: 2, intent: { score: 2, confidence: 0.9 }, development: { score: 2, confidence: 0.9 } },
] };

test("Jev ranks confident source reviews while uncertain ideas keep their positions", () => {
  assert.deepEqual(rankCandidates(candidates, review).map(c => c.option.slot), ["d4", "d3", "d2"]);
  assert.deepEqual(candidates.map(c => c.option.slot), ["d2", "d3", "d4"]);
});

test("the API receives source only, sends credentials only in Authorization, and validates scores", async () => {
  const score = { type: "score", score: 1.5, confidence: 0.8 };
  const result = await reviewCandidates(input, [candidates[0]], { apiKey: "test-secret", fetch: async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
    assert.ok(!String(init?.body).includes("test-secret"));
    return Response.json({ model: "test", answers: { intent_0: score, development_0: score } });
  } });
  assert.equal(result.candidates[0].intent.score, 1.5);
  await assert.rejects(reviewCandidates(input, [candidates[0]], { apiKey: "test", fetch: async () => Response.json({ model: "test", answers: { intent_0: { ...score, score: 999 }, development_0: score } }) }), /invalid Jev score/);
  await assert.rejects(reviewCandidates(input, candidates, { apiKey: "test", fetch: async () => new Response("sensitive server details", { status: 401 }) }), /^Error: Jev review failed \(HTTP 401\)$/);
});

test("a failed optional review still offers composed ideas and reports its fallback", async () => {
  const offered: Candidate[] = [], events: string[] = [];
  await suggestionRound([input], (option, agent) => offered.push({ option, agent }), (kind, detail) => events.push(`${kind}:${detail.status}`),
    async (request, offer) => { const o = candidate(request.angle!).option; offer(o); return [o]; },
    async () => { throw new Error("offline"); });
  assert.equal(offered.length, 3);
  assert.ok(events.includes("review:unavailable"));
});

test("cancelling while Jev evaluates prevents every buffered option from appearing", async () => {
  const controller = new AbortController();
  await suggestionRound([{ ...input, signal: controller.signal }], () => assert.fail("cancelled option"), () => {},
    async (request, offer) => { const o = candidate(request.angle!).option; offer(o); return [o]; },
    async () => { controller.abort(); return review; });
});

test("the first reviewed idea appears while slower composers are still working", { timeout: 2000 }, async () => {
  const releases = new Map<string, () => void>(), offered: string[] = [], batches: string[][] = [];
  let firstReady!: () => void;
  const first = new Promise<void>(resolve => { firstReady = resolve; });
  const pending = suggestionRound([input], option => { offered.push(option.slot); firstReady(); }, () => {},
    async (request, offer) => {
      await new Promise<void>(resolve => releases.set(request.angle!, resolve));
      const o = candidate(request.angle!).option; offer(o); return [o];
    }, async (_input, batch) => {
      batches.push(batch.map(c => c.option.slot));
      return { model: "test", candidates: batch.map((_, index) => ({ index,
        intent: { score: index, confidence: 1 }, development: { score: index, confidence: 1 } })) };
    });
  releases.get("groove")!();
  await first;
  assert.deepEqual(offered, ["groove"], "a slow composer must not block the first reviewed idea");
  assert.deepEqual(batches, [["groove"]]);
  releases.get("hook")!(); releases.get("turn")!();
  await pending;
  assert.deepEqual(offered, ["groove", "turn", "hook"], "only the unpublished batch may be reordered");
});

test("explicit dotenv configuration imports only the Jev key without running shell content", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ears-jev-key-"));
  try {
    const file = path.join(dir, ".env");
    await writeFile(file, "JEV_API_KEY='fixture-key'\nUNRELATED_SECRET=leave-alone\nSHELL_TEXT=$(exit 1)\n");
    const env = { EARS_JEV_ENV_FILE: file };
    assert.equal(await loadJevApiKey(env), "fixture-key");
    assert.deepEqual(env, { EARS_JEV_ENV_FILE: file });
    assert.equal(await loadJevApiKey({ ...env, JEV_API_KEY: "override" }), "override");
    await assert.rejects(loadJevApiKey({}), /Set JEV_API_KEY/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
