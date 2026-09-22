import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./engine.ts";

export type AmbientEffect = "hit" | "miss" | "flat" | "ungraded";
export interface RecipeMemory { takes: number; skips: number; hit: number; miss: number; flat: number; last_at: number }
interface MemoryFile { version: 1; agents: Record<string, Record<string, RecipeMemory>> }
const blank = (): RecipeMemory => ({ takes: 0, skips: 0, hit: 0, miss: 0, flat: 0, last_at: 0 });

/** Persistent contextual bandit: takes mean taste, measured outcomes mean the gesture was actually audible. */
export class AmbientLearning {
  private data: MemoryFile = { version: 1, agents: {} };
  constructor(readonly file = process.env.EARS_AMBIENT_MEMORY || path.join(ROOT, "tui/state/ambient-learning.json")) {
    try { const parsed = JSON.parse(fs.readFileSync(file, "utf8")); if (parsed?.version === 1 && parsed?.agents) this.data = parsed; } catch {}
  }
  private memory(agent: string, recipe: string) { return (this.data.agents[agent] ??= {})[recipe] ??= blank(); }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true }); const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2) + "\n"); fs.renameSync(temp, this.file);
  }
  decision(agent: string, recipe: string, decision: "take" | "skip") {
    const m = this.memory(agent, recipe); decision === "take" ? m.takes++ : m.skips++; m.last_at = Date.now(); this.save();
    return { ...m, score: this.score(agent, recipe) };
  }
  outcome(agent: string, recipe: string, effect: AmbientEffect) {
    const m = this.memory(agent, recipe); if (effect === "hit") m.hit++; else if (effect === "miss") m.miss++; else if (effect === "flat") m.flat++;
    m.last_at = Date.now(); this.save(); return { ...m, score: this.score(agent, recipe) };
  }
  score(agent: string, recipe: string) {
    const own = this.data.agents[agent]?.[recipe] ?? blank();
    const aggregate = Object.values(this.data.agents).map(x => x[recipe]).filter(Boolean).reduce((a, m) => ({
      takes: a.takes + m.takes, skips: a.skips + m.skips, hit: a.hit + m.hit, miss: a.miss + m.miss,
      flat: a.flat + m.flat, last_at: Math.max(a.last_at, m.last_at),
    }), blank());
    const trials = own.takes + own.skips + own.hit + own.miss + own.flat;
    const total = Object.values(this.data.agents[agent] ?? {}).reduce((n, m) => n + m.takes + m.skips, 0);
    const preference = (1 + own.takes) / (2 + own.takes + own.skips * 0.22);
    const audible = (1 + own.hit) / (2 + own.hit + own.miss + own.flat * 0.55);
    const world = (1 + aggregate.takes + aggregate.hit * 0.35) /
      (2 + aggregate.takes + aggregate.skips * 0.22 + aggregate.hit * 0.35 + aggregate.miss * 0.2 + aggregate.flat * 0.2);
    return (preference - 0.5) * 0.9 + (audible - 0.5) * 0.28 + (world - 0.5) * 0.25 + Math.sqrt(Math.log(total + 2) / (trials + 1)) * 0.1;
  }
  scores(agent: string, recipes: string[]) { return Object.fromEntries(recipes.map(id => [id, +this.score(agent, id).toFixed(4)])); }
}
