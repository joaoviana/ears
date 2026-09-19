// A new base for the set from one number. Same seed, same four slots; a different seed changes the tempo, the key,
// the scale, the groove, the bass line and what the fourth voice even is. Patterns also carry their own randomness
// (Pwhite, Prand, Pbrown), so even one seed never loops identically.
export interface Base { seed: number; bpm: number; root: number; scale: string; key: string; slots: Record<string, string>; about: string }

const SCALES: Record<string, number[]> = { minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], "harmonic minor": [0, 2, 3, 5, 7, 8, 11], "minor pentatonic": [0, 3, 5, 7, 10] };
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const euclid = (k: number, n: number, rot = 0) => Array.from({ length: n }, (_, i) => (((i + rot) * k) % n < k ? 1 : 0));
const f = (x: number) => String(+x.toFixed(2));
const row = (steps: number[], ghost = 0, r: () => number = Math.random) => `"${steps.map((x) => (x ? (r() < ghost ? "x" : "X") : "-")).join("")}"`;

export function makeBase(seed: number): Base {
  const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)], chance = (p: number) => r() < p;
  const bpm = pick([120, 122, 124, 126, 128, 130, 132, 134, 138]), rootPc = Math.floor(r() * 12), root = 24 + ((rootPc + 2) % 12) + (rootPc < 4 ? 12 : 0);   // bass root between D1 and C#2
  const scaleName = pick(Object.keys(SCALES)), sc = SCALES[scaleName], deg = (d: number, oct = 0) => root + oct * 12 + sc[((d % sc.length) + sc.length) % sc.length] + Math.floor(d / sc.length) * 12;
  const about: string[] = [];

  // d1 kick
  const kickKind = pick(["four", "four", "four", "broken", "euclid", "half"]);
  const kickSteps = kickKind === "four" ? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] : kickKind === "broken" ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0] : kickKind === "half" ? [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] : euclid(pick([3, 5, 5, 6]), 16);
  const tune = pick([38, 41, 44, 48, 52]), kdec = pick([0.22, 0.3, 0.36, 0.5]);
  const d1 = `~d.(\\d1, \\instrument, \\kick, \\dur, 1/4, \\amp, ~x.(${row(kickSteps)}, 0.9), \\tune, ${tune}, \\dec, ${kdec}, \\drive, ${pick([1.2, 1.6, 2.4])})`;
  about.push(`${kickKind} kick`);

  // d2 hats
  const hatKind = pick(["sixteenths", "offbeat", "euclid", "shuffle"]);
  const d2 = hatKind === "sixteenths" ? `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, Pseq([0.1, 0.16, 0.28, 0.16], inf) * Pwhite(0.7, 1.1), \\dec, Pwrand([0.03, 0.12], [0.9, 0.1], inf), \\pan, Pwhite(-0.4, 0.4))`
    : hatKind === "offbeat" ? `~d.(\\d2, \\instrument, \\hat, \\dur, 1/2, \\amp, Pseq([Rest(0), 0.26], inf), \\dec, Pwrand([0.06, 0.16], [0.6, 0.4], inf), \\hp, ${pick([6000, 7500, 9000])})`
    : hatKind === "euclid" ? `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.(${row(euclid(pick([7, 9, 11, 13]), 16, Math.floor(r() * 4)), 0.4, r)}, 0.28), \\pan, Pbrown(-0.5, 0.5, 0.2))`
    : `~d.(\\d2, \\instrument, \\hat, \\dur, Pseq([1/3, 1/6], inf) * 1/2 * 2, \\amp, Pseq([0.24, 0.12], inf) * Pwhite(0.8, 1.1), \\hp, 8000)`;
  about.push(`${hatKind} hats`);

  // d3 low voice
  const low = pick(["bass", "bass", "acid"]), rest = 0.2 + r() * 0.3, riff: (number | null)[] = [];
  for (let i = 0; i < 16; i++) riff.push(i === 0 ? deg(0) : chance(rest) ? null : chance(0.62) ? deg(0) : chance(0.3) ? deg(0, 1) : deg(pick([2, 3, 4, 6])));
  const notes = riff.map((n) => (n === null ? "\\r" : n)).join(", ");
  const d3 = low === "bass" ? `~d.(\\d3, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${notes}], inf), \\cutoff, Pseq([${[0, 1, 2, 3].map(() => Math.round(300 + r() * 1400)).join(", ")}], inf).stutter(16), \\res, ${f(2 + r() * 1.2)}, \\amp, 0.6)`
    : `~d.(\\d3, \\instrument, \\acid, \\dur, 1/4, \\midinote, Pseq([${notes}], inf) + 12, \\cutoff, Pbrown(250, 1400, 120), \\env, Pwhite(1200, 3800), \\res, ${f(0.7 + r() * 0.25)}, \\dec, Pwrand([0.12, 0.3], [0.8, 0.2], inf), \\amp, 0.42)`;
  about.push(low === "acid" ? "acid line" : "moog bass");

  // d4 colour
  const colour = pick(["stabs", "fm", "pad", "perc", "clap"]), tri = (d0: number) => { const d = d0 % sc.length; return `[${[deg(d, 2), deg(d + 2, 2), deg(d + 4, 2), deg(d + 6, 2)].map((m) => (m > 84 ? m - 12 : m)).join(", ")}]`; }, prog = [0, pick([5, 3, 6]), pick([3, 4]), pick([6, 4, 0])];
  const d4 = colour === "stabs" ? `~d.(\\d4, \\instrument, \\stab, \\dur, Pseq([1, 2.5, 0.5], inf), \\amp, Pseq([Rest(0), 0.15, 0.15], inf), \\midinote, Pseq([${prog.slice(0, 2).map(tri).join(", ")}], inf).stutter(6), \\cutoff, Pbrown(900, 2600, 200), \\send, 1)`
    : colour === "fm" ? `~d.(\\d4, \\instrument, \\fm, \\dur, ${pick(["1/4", "1/2", "3/4"])}, \\midinote, Prand([${[0, 2, 4, 7, 9, 11].map((d) => deg(d, 3)).join(", ")}, \\r, \\r], inf), \\ratio, ${pick([1, 2, 3.5, 7.1])}, \\index, Pwhite(1.0, 5.0), \\dec, Pwhite(0.15, 0.7), \\amp, 0.14, \\pan, Pwhite(-0.7, 0.7), \\send, 0.7)`
    : colour === "pad" ? `~d.(\\d4, \\instrument, \\pad, \\dur, 8, \\midinote, Pseq([${prog.map(tri).join(", ")}], inf), \\sus, ${f((60 / bpm) * 6)}, \\cutoff, Pwhite(700, 1800), \\amp, 0.09)`
    : colour === "perc" ? `~d.(\\d4, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.(${row(euclid(pick([3, 5, 7]), pick([8, 12, 16]), 2), 0.3, r)}, 0.3), \\freq, Prand([${[deg(0, 3), deg(2, 3), deg(4, 3)].map((m) => Math.round(440 * Math.pow(2, (m - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.08, 0.25), \\pan, Pwhite(-0.6, 0.6))`
    : `~d.(\\d4, \\instrument, \\clap, \\dur, 1, \\amp, Pseq([Rest(0), 0.5], inf), \\send, ${f(0.3 + r() * 0.5)})`;
  about.push(colour);

  return { seed, bpm, root, scale: scaleName, key: `${NOTE[root % 12]} ${scaleName}`, slots: { d1, d2, d3, d4 }, about: about.join(" · ") };
}
