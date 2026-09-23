// The profile vocabulary, in the form a DJ reads. It comes straight from the protocol's reference profile, the
// same table the protocol publishes in `hello.capabilities`, so an outside agent and a built-in DJ are told the same
// thing about what each metric means and what moves it. There is no host copy to drift.
//
// This exists because of a measured failure: DJs reliably predicted the wrong metric. They would bring a buried
// kick back and call "punch up", when what moved was sub and loudness, and the grade said MISS for a good idea.
import { EARS_MUSIC, type MetricSpec } from "ears-protocol/profile";
import { METRICS } from "./shots.ts";

const SPECS = new Map<string, MetricSpec>(EARS_MUSIC.observation.metrics.map((m) => [m.id, m]));
const spec = (id: string) => {
  const m = SPECS.get(id);
  if (!m) throw new Error(`metric "${id}" is graded by the host but missing from the ears/music profile`);
  return m;
};

/** The table a DJ reads before it calls its shot. */
export const METRIC_TABLE = METRICS.map((id) => {
  const m = spec(id);
  return `  ${id.padEnd(11)}${m.meaning} (${m.unit})\n${" ".repeat(13)}moved by: ${m.moved_by.join(" · ")}${m.scope.includes("slot") ? "" : "  (measured on the whole mix only)"}`;
}).join("\n");
export const metricNames = () => METRICS.join(", ");
