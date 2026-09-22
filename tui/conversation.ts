import { ask, type AskInput, type Suggestion } from "./agent.ts";

export interface MusicalAnswer { label: string; angle: string; instruction: string }
export interface MusicalQuestion { text: string; answers: [MusicalAnswer, MusicalAnswer] }

/** Questions choose intent, never notes, rhythm recipes, or a generated patch. */
export function musicalQuestion(input: AskInput): MusicalQuestion {
  const lastTaken = [...input.history].reverse().find(h => h.verdict === "y");
  if (lastTaken && ["d1", "d2", "d3"].includes(lastTaken.slot)) return {
    text: "Where should the melody sit against this groove?",
    answers: [
      { label: "Bring it forward", angle: "hook", instruction: "Keep the current drum groove. Develop a foreground melodic phrase that responds to it. Preserve a recognisable fragment of the current material." },
      { label: "Leave more space", angle: "hook", instruction: "Keep the current drum groove. Reshape the melodic phrasing to leave purposeful gaps and answers. Make a musical development, not just a gain reduction." },
    ],
  };
  return {
    text: "Keep this groove or reshape it?",
    answers: [
      { label: "Keep the groove", angle: "hook", instruction: "Keep the existing drum and bass groove intact. Compose one melodic or textural development around it, related to the current phrase." },
      { label: "Reshape the groove", angle: "groove", instruction: "Reshape the rhythmic relationship between the current voices. Keep one recognisable pulse as an anchor and preserve the harmonic identity. Choose the mechanism from the actual source." },
    ],
  };
}

interface Branch {
  input: AskInput; controller: AbortController; option?: Suggestion; error?: Error; done: boolean;
}

/** Compose while the performer considers the question. Only their chosen branch can become a proposal. */
export class ConversationRound {
  readonly question: MusicalQuestion;
  readonly done: Promise<void>;
  private branches: Branch[];
  private chosen: number | null = null;
  private ended = false;
  private resolve!: () => void;
  private reject!: (error: Error) => void;
  private parentAbort = () => this.cancel();

  constructor(private input: AskInput,
    private offer: (option: Suggestion, input: AskInput) => void,
    private event: (kind: string, detail: Record<string, unknown>) => void = () => {},
    model: typeof ask = ask) {
    this.question = musicalQuestion(input);
    this.done = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.branches = this.question.answers.map(answer => {
      const controller = new AbortController();
      return { controller, done: false, input: { ...input, signal: controller.signal, angle: answer.angle,
        note: [input.note, `PERFORMER DIRECTION: ${answer.instruction}`, "Offer one focused musical move. Touch only the voices it needs."].filter(Boolean).join("\n") } };
    });
    if (input.signal?.aborted) { this.cancel(); return; }
    input.signal?.addEventListener("abort", this.parentAbort, { once: true });
    this.branches.forEach((branch, index) => {
      // Defer invocation so the caller can install the question and cancellation handle first.
      Promise.resolve().then(() => {
        if (branch.controller.signal.aborted) return;
        return model(branch.input, option => {
          if (this.ended || branch.controller.signal.aborted || branch.option) return;
          branch.option = { ...option, origin: "model" };
          this.deliver();
        }, (kind, detail) => {
          if (!this.ended && !branch.controller.signal.aborted) this.event(kind, { ...detail, branch: index });
        });
      }).catch(error => {
        branch.error = error instanceof Error ? error : new Error("composition failed");
      }).finally(() => {
        branch.done = true;
        this.deliver();
      });
    });
  }

  choose(index: number): boolean {
    if (this.ended || this.chosen !== null || !this.branches[index]) return false;
    this.chosen = index;
    this.branches.forEach((branch, i) => { if (i !== index) branch.controller.abort(); });
    this.deliver();
    return true;
  }

  cancel() { if (!this.ended) { this.finish(); this.resolve(); } }

  private finish() {
    this.ended = true;
    this.input.signal?.removeEventListener("abort", this.parentAbort);
    this.branches.forEach(branch => branch.controller.abort());
  }

  private deliver() {
    if (this.ended || this.chosen === null) return;
    const branch = this.branches[this.chosen];
    if (branch.option) {
      try { this.offer(branch.option, { ...branch.input, signal: this.input.signal }); }
      catch (error) { this.finish(); this.reject(error instanceof Error ? error : new Error("could not offer the move")); return; }
      this.finish(); this.resolve();
    } else if (branch.done) {
      this.finish(); this.reject(branch.error ?? new Error("no usable move for this direction; try another brief"));
    }
  }
}
