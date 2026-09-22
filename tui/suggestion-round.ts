import { ask, WILD, type AskInput, type Suggestion } from "./agent.ts";
import { DEFAULT_WILD } from "./direction.ts";
import { reviewCandidates, rankCandidates, loadJevApiKey, type Candidate, type JevReview } from "./jev.ts";

type Reviewer = (input: AskInput, candidates: Candidate[]) => Promise<JevReview>;

export function configuredReviewer(): Reviewer | undefined {
  if (process.env.EARS_JEV_RANK !== "1") return;
  let key: Promise<string> | undefined;
  return async (input, candidates) => reviewCandidates(input, candidates, {
    apiKey: await (key ??= loadJevApiKey()), signal: input.signal,
  });
}

/** Each seat is composed against the live source; no recipe fills a seat while a DJ is thinking. */
export async function suggestionRound(inputs: AskInput[], onOption: (option: Suggestion, agent: string) => void,
  onEvent: (kind: string, detail: Record<string, unknown>) => void, model: typeof ask = ask,
  review: Reviewer | null | undefined = configuredReviewer()): Promise<void> {
  if (!inputs.length || inputs[0].signal?.aborted) return;
  const mode = WILD[Math.max(0, Math.min(WILD.length - 1, inputs[0].wild ?? DEFAULT_WILD))];
  const offered = new Set<string>();
  const pendingReview: Candidate[] = [];
  let reviewTail = Promise.resolve(), reviewQueued = false, completed = 0;
  const showcase = inputs.find(input => input.showcase);
  const requested = Number(process.env.EARS_ANGLES || 3);
  const count = Number.isFinite(requested) ? Math.max(1, Math.min(3, Math.floor(requested))) : 3;
  // Review the first completed idea immediately. While that request runs, subsequent completions
  // accumulate into the next batch. Already-visible numbered choices are never reordered.
  const queueReview = () => {
    if (!review || reviewQueued) return;
    const reviewer = review;
    reviewQueued = true;
    reviewTail = reviewTail.then(async () => {
      reviewQueued = false;
      const batch = pendingReview.splice(0);
      if (!batch.length || inputs[0].signal?.aborted) return;
      let ordered = batch;
      onEvent("review", { status: "pending", completed, total: count, text: `Jev reviewing ${batch.length} completed idea${batch.length === 1 ? "" : "s"}` });
      try {
        const result = await reviewer(inputs[0], batch);
        if (inputs[0].signal?.aborted) return;
        ordered = rankCandidates(batch, result);
        onEvent("review", { status: "complete", completed, total: count, text: "Jev source review complete", ...result });
      } catch (error) {
        if (inputs[0].signal?.aborted) return;
        onEvent("review", { status: "unavailable", completed, total: count, text: "Jev review unavailable; composed ideas retain their original order", reason: error instanceof Error ? error.message : "review failed" });
      }
      for (const candidate of ordered) {
        if (inputs[0].signal?.aborted) return;
        onOption(candidate.option, candidate.agent);
      }
    });
  };
  onEvent("composition", { completed, total: count });
  const results = await Promise.allSettled(mode.angles.slice(0, count).map(async (angle, index) => {
    const input = index === 0 && showcase ? showcase : inputs[index % inputs.length];
    try { await model({ ...input, showcase: index === 0 ? input.showcase : null, angle }, option => {
      if (input.signal?.aborted) return;
      const signature = JSON.stringify(option.parts.map(part => [part.slot, part.code.trim()]).sort(([a], [b]) => a.localeCompare(b)));
      if (offered.has(signature)) return;
      offered.add(signature);
      const candidate = { option: { ...option, origin: "model" as const }, agent: input.dj.id };
      if (review) { pendingReview.push(candidate); queueReview(); }
      else onOption(candidate.option, candidate.agent);
    }, onEvent);
    } finally {
      completed++;
      if (!input.signal?.aborted) onEvent("composition", { completed, total: count });
    }
  }));
  await reviewTail;
  if (!offered.size && !inputs[0].signal?.aborted) {
    const failed = results.find(result => result.status === "rejected");
    throw failed?.status === "rejected" ? failed.reason : new Error("no usable musical ideas");
  }
}
