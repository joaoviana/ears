// The host's copy of the profile vocabulary, in the form a DJ reads. It is the same table the protocol publishes
// in `hello.capabilities` (ears-protocol/src/profile.ts), so an outside agent and a built-in DJ are told the same
// thing about what each metric means and what moves it.
//
// This exists because of a measured failure: DJs reliably predicted the wrong metric. They would bring a buried
// kick back and call "punch up", when what moved was sub and loudness, and the grade said MISS for a good idea.
import { METRICS, type Metric } from "./shots.ts";

const MOVED_BY: Record<Metric, string> = {
  sub: "kick amp · kick tune (lower = more sub) · kick dec (longer) · bass amp · bass cutoff (lower)",
  low: "bass cutoff · bass res around 150 Hz · kick body · a pad or choir in a low register",
  mid: "bass res at 500-900 Hz · stab or pad cutoff · fm ratio 1-2 · clap body",
  high: "hat amp · clap amp and send · fm index and ratio · stab cutoff above 2 kHz · kick drive",
  air: "hat hp · hat dec (longer = more air) · hat amp · perc click",
  brightness: "any filter cutoff · hat amp or dec · fm index · acid env · adding or removing a high voice",
  loudness: "any amp · kick drive · duck (less ducking = louder) · adding or removing a voice",
  density: "step rows with more hits · shorter dur · removing rests · adding a percussive voice",
  punch: "kick dec (shorter = punchier) · removing a sustained voice · duck (more ducking) · shorter decays",
  width: "pan (a Pwhite or Pbrown on pan widens; a fixed 0 narrows) · a stereo voice like choir or pad · send (reverb widens)",
  groove: "dur values off the grid (1/3, 1/6 for triplets; a swung Pseq of two durs) · straight 1/4 and 1/8 are dead on the grid",
};
const MEANING: Record<Metric, string> = {
  sub: "energy below 80 Hz, relative to the mix", low: "energy around 150 Hz", mid: "energy around 700 Hz, where boxiness lives",
  high: "energy around 3 kHz: presence and harshness", air: "energy above 7 kHz: fizz and sheen",
  brightness: "spectral centroid in Hz: dark vs bright", loudness: "average level in dB", density: "onsets per beat: busy vs sparse",
  punch: "peak over average in dB: spiky vs squashed",
  width: "stereo width in dB: how much left and right differ",
  groove: "how far hits land from the 16th grid, in ms: 0 is machine-tight, more is swung or loose",
};
/** metrics the host can measure on the edited slot alone; the rest are judged on the whole mix */
const PER_SLOT = new Set<Metric>(["sub", "low", "mid", "high", "air", "brightness", "loudness", "width"]);

/** The table a DJ reads before it calls its shot. */
export const METRIC_TABLE = METRICS.map((m) => `  ${m.padEnd(11)}${MEANING[m]}\n${" ".repeat(13)}moved by: ${MOVED_BY[m]}${PER_SLOT.has(m) ? "" : "  (measured on the whole mix only)"}`).join("\n");
export const metricNames = () => METRICS.join(", ");
