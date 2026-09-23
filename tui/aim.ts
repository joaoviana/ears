// Which voice each angle of a round is pointed at, and what the booth is told has been left alone.
import { SLOTS } from "./session.ts";

/** Per slot, the bar it was last written on. A slot nobody has written counts from bar 0. */
export type Touched = Record<string, { bar: number } | undefined>;

const idle = (slots: Record<string, string>, touched: Touched, bar: number) =>
  SLOTS.filter((k) => (slots[k] || "").trim()).map((k) => ({ k, bars: bar - (touched[k]?.bar ?? 0) }));

/** One voice per angle: the worst drift for fix, something empty or undoubled for add, anything else for turn. */
export const aimAt = (a: { round: number; wild: number; bar: number; drift: { slot: string }[]; slots: Record<string, string>; touched: Touched }): Record<string, string> => {
  const empty = SLOTS.filter((k) => !(a.slots[k] || "").trim());
  const stale = idle(a.slots, a.touched, a.bar).sort((x, y) => y.bars - x.bars);
  const fix = a.drift[0]?.slot ?? stale[0]?.k ?? "d1";
  const add = empty[0] ?? stale.map((x) => x.k).find((k) => k !== fix) ?? "d6";
  const turn = SLOTS.find((k) => k !== fix && k !== add) ?? "d3";
  return { fix, add, turn: a.wild >= 2 ? "d6" : turn, groove: a.round % 2 ? "d3" : "d2", hook: a.round % 2 ? "d4" : "d5" };
};

/** What the `add` angle is given instead of the problem list: the parts nobody has touched in eight bars. */
export const quietLine = (slots: Record<string, string>, touched: Touched, bar: number) => {
  const stale = idle(slots, touched, bar).filter((x) => x.bars >= 8).sort((x, y) => y.bars - x.bars);
  if (!stale.length) return "Everything has been touched in the last 8 bars.";
  return `Nothing has changed in ${stale.slice(0, 4).map((x) => `${x.k} for ${x.bars} bars`).join(", ")}.`;
};
