import { ask, type AskInput, type Suggestion } from "./agent.ts";
import { instantVariations } from "./instant.ts";
import { ambientArsenal, enrichAmbientSuggestion } from "./ambient-arsenal.ts";

/** Instant proposals are delivered synchronously. Only the third seat waits on a model. */
export function fastRound(inputs: AskInput[], onOption: (o: Suggestion, agent: string) => void,
  onEvent: (kind: string, detail: Record<string, unknown>) => void, model: typeof ask = ask): Promise<void> {
  if (!inputs.length || inputs[0].signal?.aborted) return Promise.resolve();
  const offered: Suggestion[] = [];
  for (let i = 0; i < 2; i++) {
    const input = inputs[i % inputs.length];
    const candidates = /ambient|nature/i.test(input.context) ? ambientArsenal(input, 3) : instantVariations(input);
    const option = candidates.find(o => !offered.some(x => x.code === o.code || x.slot === o.slot))
      ?? candidates.find(o => !offered.some(x => x.code === o.code));
    if (option) { offered.push(option); onOption(option, input.dj.id); }
  }
  onEvent("curation", {
    agent: inputs[0].dj.id,
    recipes: offered.map(option => option.recipe_id).filter(Boolean),
    scores: Object.fromEntries(offered.filter(option => option.recipe_id).map(option => [option.recipe_id!, inputs[0].recipeScores?.[option.recipe_id!] ?? 0])),
  });
  onEvent("composition", { completed: offered.length, total: 3 });
  const chosen = inputs.find(i => i.showcase) ?? inputs[2 % inputs.length];
  const reserved = new Set(offered.flatMap(option => option.parts.map(part => part.slot)));
  const note = [chosen.note, offered.length ? `Already offered as instant alternatives: ${offered.map(o => `${o.parts.map(part => part.slot).join("+")}: ${o.why}`).join("; ")}. Those slots are reserved. FORBIDDEN IN THE WILDCARD: ${offered.map(o => o.angle).join(", ")} and every named sample or material in those moves, even in another slot. Compose a distinctly different relationship from untouched material.` : ""].filter(Boolean).join("\n");
  const ambient = /ambient|nature/i.test(chosen.context);
  const offeredAngles = new Set(offered.map(option => option.angle));
  const rhythmic = new Set(["fingertips", "marbles", "twig-cycle", "pebble-pairs", "leaf-shuffle", "reed-answer",
    "air-flutter", "understone", "brush-burst", "paper-fall", "rain-polyrhythm", "wave-shutters", "pulse"]);
  const ambientAngles = !offered.some(option => rhythmic.has(option.angle)) && (chosen.round ?? 0) % 5 === 0
    ? ["pulse", "transform", "texture", "droplets"]
    : offeredAngles.has("clearing") || offeredAngles.has("tide")
      ? ["droplets", "texture", "transform", "pulse"] : ["transform", "texture", "droplets", "pulse"];
  const modelAngle = ambientAngles.find(angle => !offeredAngles.has(angle)) ?? "transform";
  return model({ ...chosen, angle: ambient ? modelAngle : chosen.wild === 0 ? "fix" : "turn", note }, o => {
    if (!chosen.signal?.aborted && !offered.some(x => x.code === o.code))
      onOption({ ...(ambient ? enrichAmbientSuggestion(chosen, o, reserved) : o), origin: "model" }, chosen.dj.id);
  }, onEvent).then(() => {}, error => {
    if (!offered.length && !chosen.signal?.aborted) throw error;
  }).finally(() => onEvent("composition", { completed: 3, total: 3 }));
}
