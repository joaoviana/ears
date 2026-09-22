// A new base for the set from one number. A seed picks a STYLE first, and the style decides how everything else is
// rolled, so the six slots belong together: tempo range, kick figure, hat feel and swing, what the bass does, a
// chord progression the bass follows (\ctranspose), and a lead. Grooves turn around every fourth bar (A A A B rows),
// and patterns carry their own randomness, so even one seed never loops identically.
export interface Base { seed: number; style: string; mood: string; bpm: number; root: number; scale: string; key: string; slots: Record<string, string>; about: string }

const SCALES: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], "harmonic minor": [0, 2, 3, 5, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PROGRESSIONS = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 0, 3, 0], [0, 2, 3, 5], [0, 0, 5, 6]];   // scale degrees, one per bar
// the warm ones: I-V-vi-IV, I-vi-ii-V, ii-V-I-I, IV-V-iii-vi, I-iii-IV-V, vi-IV-I-V (in dorian they read i-IV-ii-v: still sunny)
const WARM = [[0, 4, 5, 3], [0, 5, 1, 4], [1, 4, 0, 0], [3, 4, 2, 5], [0, 2, 3, 4], [5, 3, 0, 4]];
export type Mood = "vibey" | "dark" | "any";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const f = (x: number) => String(+x.toFixed(3));

interface Style { name: string; mood: "vibey" | "dark"; /** play the sampled kit (tui/samples/kit) instead of the synth drums. Off for the archive: the benchmark measured
   * the synths. NOTE: only d1 is a real branch. d2..d6 are object literals whose every template string is evaluated
   * before the key is indexed, so a new vocabulary entry MUST NOT call r() / pick() / int() / chance() - it would
   * draw from the seeded rng for every style and shift the dark bases the benchmark depends on. */ kit?: boolean; bpm: [number, number]; scales: string[]; kick: string[][]; hats: string; clap: string; bass: string; chords: string; lead: string; swing?: number }
// The six the set rolls through. Fifteen meant none of them got the attention to be worth opening a demo on, and
// most were drums with a rumour of harmony underneath. These are the ones that are supposed to sound good.
const STYLES: Style[] = [
  { name: "ambient", mood: "vibey", bpm: [58, 68], scales: ["lydian", "major"], kick: [["----------------"]], hats: "nature-rain", clap: "nature-birds", bass: "ambient-drone", chords: "ambient-pad", lead: "ambient-motes" },
  { name: "boogie", mood: "vibey", kit: true, bpm: [112, 118], scales: ["major", "mixolydian"], kick: [["X---X---X---X---", "X---X---X--XX---"]], hats: "kit-swung", clap: "kit-conga", bass: "octaves", chords: "kit-piano", lead: "arp-bright", swing: 0.035 },
  { name: "italo", mood: "vibey", kit: true, bpm: [124, 130], scales: ["major", "lydian"], kick: [["X---X---X---X---"]], hats: "kit-offbeat", clap: "kit-snare", bass: "disco", chords: "stabs", lead: "saw-arp" },
  { name: "glitch", mood: "vibey", kit: true, bpm: [122, 128], scales: ["mixolydian", "major"], kick: [["X-------X-------", "X-------X---X---"]], hats: "kit-sparse", clap: "kit-tick", bass: "sub-gap", chords: "keys-wide", lead: "hyper-saw" },
  { name: "piano house", mood: "vibey", kit: true, bpm: [126, 132], scales: ["major", "mixolydian"], kick: [["X---X---X---X---", "X---X---X--XX--x"]], hats: "kit-16", clap: "kit-perc", bass: "pump", chords: "kit-piano", lead: "kit-top" },
];
// Out of the rotation, nothing deleted. Still reachable: `b` twice (mood "any"), `--style "<name>"`, or for the dark
// family `b` once. Every benchmark run was seeded from the dark family via `makeBase(seed, "dark")`, so deleting any
// of it would make runs 1-4 in docs/does-the-protocol-help.md unreproducible.
const ARCHIVE: Style[] = [
  // The set that starts from nothing. Two voices: a kick for the grid and a sub so the ears have something to
  // measure. d2, d3, d5 and d6 are EMPTY on purpose - the host lists them to every DJ as free, the `add` angle
  // hunts them, and the track composes itself as you take ideas. Out of the rotation so `g` can never roll it
  // mid-set; reach it deliberately with `npm run ears -- --style opening`.
  { name: "opening", mood: "vibey", kit: true, bpm: [120, 126], scales: ["mixolydian", "major"], kick: [["X---------------", "X-------X-------"]], hats: "none", clap: "none", bass: "sub-gap", chords: "none", lead: "none" },
  // retired from the live rotation 21 Sept, kept whole:
  { name: "melodic", mood: "vibey", bpm: [122, 126], scales: ["dorian", "minor"], kick: [["X---X---X---X---", "X---X---X---X-x-"], ["X---X-----X-X---", "X---X-----X-X-x-"]], hats: "offbeat-open", clap: "backbeat", bass: "saw-octaves", chords: "saw-pad", lead: "saw-arp" },
  { name: "euphoric", mood: "vibey", bpm: [130, 136], scales: ["major", "lydian"], kick: [["X---X---X---X---"]], hats: "sixteenths", clap: "backbeat", bass: "saw-octaves", chords: "saw-pad", lead: "saw-arp" },
  { name: "deep house", mood: "vibey", bpm: [118, 124], scales: ["dorian", "major"], kick: [["X---X---X---X---", "X---X---X---X--x"]], hats: "shaker", clap: "backbeat", bass: "round", chords: "epiano", lead: "pluck", swing: 0.025 },
  { name: "nu disco", mood: "vibey", bpm: [114, 122], scales: ["major", "mixolydian"], kick: [["X---X---X---X---"]], hats: "offbeat-open", clap: "backbeat", bass: "disco", chords: "choir-warm", lead: "arp-bright" },
  { name: "balearic", mood: "vibey", bpm: [106, 116], scales: ["major", "lydian"], kick: [["X---X---X---X---", "X---X---X-----X-"]], hats: "shaker", clap: "rim", bass: "round", chords: "warm-pad", lead: "epiano-melody", swing: 0.02 },
  { name: "french touch", mood: "vibey", bpm: [120, 126], scales: ["major", "mixolydian"], kick: [["X---X---X---X---"]], hats: "offbeat-open", clap: "backbeat", bass: "disco", chords: "filter-stabs", lead: "saw-arp" },
  { name: "detroit", mood: "dark", bpm: [126, 132], scales: ["minor", "dorian"], kick: [["X---X---X---X---", "X---X---X---X-x-"]], hats: "sixteenths", clap: "backbeat", bass: "riff", chords: "stabs", lead: "fm-sparse" },
  { name: "dub techno", mood: "dark", bpm: [118, 124], scales: ["minor", "dorian"], kick: [["X---X---X---X---"]], hats: "offbeat", clap: "rim", bass: "sub", chords: "dub-chord", lead: "pad" },
  { name: "acid", mood: "dark", bpm: [128, 136], scales: ["phrygian", "minor"], kick: [["X---X---X---X---", "X---X---X--XX---"]], hats: "sixteenths", clap: "backbeat", bass: "acid", chords: "none", lead: "toms" },
  { name: "electro", mood: "dark", bpm: [124, 130], scales: ["minor", "phrygian"], kick: [["X--X--X---X--X--", "X--X--X---X-X-X-"], ["X-----X-X-----X-", "X-----X-X--X--X-"]], hats: "sixteenths", clap: "snare", bass: "staccato", chords: "stabs", lead: "zaps" },
  { name: "two-step", mood: "dark", bpm: [130, 134], scales: ["minor", "dorian"], kick: [["X---------X-----", "X------X--X-----"]], hats: "swung", clap: "backbeat", bass: "sub-bounce", chords: "organ", lead: "fm-sparse", swing: 0.045 },
  { name: "minimal", mood: "dark", bpm: [124, 128], scales: ["minor", "mixolydian"], kick: [["X---X---X---X---"]], hats: "euclid", clap: "poly", bass: "one-note", chords: "none", lead: "blips" },
  { name: "progressive", mood: "dark", bpm: [128, 134], scales: ["minor", "harmonic minor"], kick: [["X---X---X---X---"]], hats: "offbeat-open", clap: "backbeat", bass: "offbeat", chords: "choir", lead: "arp" },
  { name: "halftime", mood: "dark", bpm: [140, 150], scales: ["minor", "phrygian"], kick: [["X---------X-----", "X--------XX-----"]], hats: "rolls", clap: "three", bass: "reese", chords: "choir", lead: "fm-sparse" },
  { name: "house", mood: "dark", bpm: [120, 126], scales: ["dorian", "mixolydian", "minor"], kick: [["X---X---X---X---", "X---X---X---X--x"]], hats: "offbeat-open", clap: "backbeat", bass: "octaves", chords: "organ", lead: "arp", swing: 0.02 },
  { name: "afro house", mood: "vibey", bpm: [118, 124], scales: ["dorian", "major"], kick: [["X---X---X---X---"]], hats: "shaker", clap: "congas", bass: "offbeat-round", chords: "marimba", lead: "choir-ooh", swing: 0.015 },
  { name: "sunny garage", mood: "vibey", bpm: [128, 132], scales: ["major", "dorian"], kick: [["X---------X-----", "X------X--X-----"]], hats: "swung", clap: "backbeat", bass: "sub-bounce", chords: "epiano", lead: "epiano-melody", swing: 0.045 },
];


export const STYLE_NAMES = STYLES.map((x) => x.name);
export const DARK_NAMES = ARCHIVE.filter((x) => x.mood === "dark").map((x) => x.name);
export const ALL_STYLES = [...STYLES, ...ARCHIVE];
export function makeBase(seed: number, mood: Mood = "vibey", only?: string): Base {
  const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)], chance = (p: number) => r() < p, int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pool = ALL_STYLES.filter((x) => (only ? x.name === only : mood === "dark" ? x.mood === "dark" : mood === "any" ? true : STYLES.includes(x)));
  const st = pick(pool.length ? pool : STYLES), ambient = st.name === "ambient";
  // The ambient base is composed, not rolled: SuperCollider supplies the living variation inside the patterns.
  // A seed may choose this style, but cannot reshuffle its musical identity.
  const bpm = ambient ? 64 : int(st.bpm[0] / 2, st.bpm[1] / 2) * 2;
  const rootPc = ambient ? 2 : int(0, 11), root = 26 + ((rootPc + 10) % 12);   // bass root D1..C#2
  const scaleName = ambient ? "lydian" : pick(st.scales), sc = SCALES[scaleName];
  const prog = ambient ? [0, 4, 1, 3] : pick(st.mood === "vibey" ? WARM : PROGRESSIONS);
  const deg = (d: number, oct = 0) => root + oct * 12 + sc[((d % sc.length) + sc.length) % sc.length] + Math.floor(d / sc.length) * 12;
  const offs = prog.map((d) => { const o = sc[d % sc.length]; return o > 6 ? o - 12 : o; });                      // chord roots as semitone offsets, kept near the tonic
  const follow = `\\ctranspose, Pseq([${offs.join(", ")}], inf).stutter(16)`;
  // the references move harmony once every few bars, not every bar: .slow(8) rather than one chord per cycle
  const slow = `\\ctranspose, Pseq([${offs.join(", ")}], inf).stutter(4)`;
  const chord = (d: number, oct: number) => `[${[0, 2, 4, 6].map((k) => deg(d + k, oct)).map((m) => (m > 79 ? m - 12 : m)).join(", ")}]`;
  // [root, 3rd, 7th, 9th]. On the iii and the vii of a major scale the 9th lands a semitone above the root - the one
  // interval in the scale that reliably sounds wrong held under a pad - so those chords fall back to a plain 7th.
  const ninth = (d: number, oct: number) => { const flat9 = ((((deg(d + 8, oct) - deg(d, oct)) % 12) + 12) % 12) === 1; return `[${(flat9 ? [0, 2, 4, 6] : [0, 2, 6, 8]).map((k) => deg(d + k, oct)).map((m, i, all) => (all[0] > 66 ? m - 12 : m)).join(", ")}]`; };   // if the root sits high, drop the whole voicing an octave: folding single notes made seconds against the root
  const rows = (xs: string[]) => (xs.length === 1 ? `"${xs[0]}"` : `["${xs[0]}", "${xs[0]}", "${xs[0]}", "${xs[1]}"]`);
  const swing = st.swing ? `Pseq([${f(0.25 + st.swing)}, ${f(0.25 - st.swing)}], inf)` : "1/4";
  const ghosted = (n: number, k: number, rot: number) => Array.from({ length: n }, (_, i) => (((i + rot) * k) % n < k ? (chance(0.35) ? "x" : "X") : "-")).join("");

  const d1 = st.name === "ambient" ? `~d.(\\d1, \\instrument, \\nature, \\buf, ~n.(\\waves), \\dur, 32, \\len, 30, \\att, 4, \\rel, 9, \\start, Pwhite(0.0, 0.65), \\rate, Pwhite(0.94, 1.03), \\hp, 45, \\lp, ~arc.(1200, 7200, 52), \\amp, 0.165, \\pan, Pwhite(-0.2, 0.2), \\send, 0.65)`
    : st.kit ? `~d.(\\d1, \\instrument, \\smp, \\buf, ~k.(\\kick), \\dur, 1/4, \\amp, ~x.(${rows(pick(st.kick))}, ${f(0.78 + r() * 0.08)}), \\dec, ${pick([0.34, 0.42, 0.5])}, \\hp, 28, \\send, 0.04)`
    : `~d.(\\d1, \\instrument, \\kick, \\dur, 1/4, \\amp, ~x.(${rows(pick(st.kick))}, 0.9), \\tune, ${st.mood === "vibey" ? pick([46, 49, 52]) : pick([38, 41, 44, 48])}, \\dec, ${st.name === "dub techno" ? 0.5 : st.mood === "vibey" ? pick([0.24, 0.3]) : pick([0.26, 0.32, 0.4])}, \\drive, ${st.name === "electro" || st.name === "acid" ? 2.2 : st.mood === "vibey" ? 1.15 : pick([1.2, 1.6])})`;

  const d2 = ({
    sixteenths: `~d.(\\d2, \\instrument, \\hat, \\dur, ${swing}, \\amp, Pseq([0.1, 0.16, 0.28, 0.16], inf) * Pwhite(0.75, 1.1), \\dec, Pwrand([0.03, 0.13], [0.9, 0.1], inf), \\pan, Pwhite(-0.35, 0.35))`,
    offbeat: `~d.(\\d2, \\instrument, \\hat, \\dur, 1/2, \\amp, Pseq([Rest(0), 0.2], inf) * Pwhite(0.7, 1.0), \\dec, 0.05, \\hp, ${pick([7000, 9000])}, \\pan, Pbrown(-0.4, 0.4, 0.1))`,
    "offbeat-open": `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.("x-X-x-X-x-X-x-X-", 0.3), \\dec, Pseq([0.03, 0.03, 0.15, 0.03], inf), \\hp, 7500)`,
    swung: `~d.(\\d2, \\instrument, \\hat, \\dur, ${swing}, \\amp, ~x.(["X-xX-xX-X-xX-xXx", "X-xX-xX-X-xXxXXx"], 0.26), \\dec, Pwrand([0.03, 0.1], [0.85, 0.15], inf), \\pan, Pwhite(-0.4, 0.4))`,
    euclid: `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.("${ghosted(16, pick([7, 9, 11]), int(0, 3))}", 0.26), \\dec, 0.03, \\pan, Pbrown(-0.5, 0.5, 0.2))`,
    shaker: `~d.(\\d2, \\instrument, \\hat, \\dur, ${swing}, \\amp, Pseq([0.07, 0.04, 0.12, 0.05], inf) * Pwhite(0.8, 1.15), \\dec, Pwrand([0.025, 0.05, 0.11], [0.6, 0.3, 0.1], inf), \\hp, ${pick([5200, 6000, 6800])}, \\pan, Pbrown(-0.4, 0.4, 0.08))`,
    rolls: `~d.(\\d2, \\instrument, \\hat, \\dur, Pwrand([Pseq([1/4], 1), Pseq([1/8, 1/8], 1), Pseq([1/12, 1/12, 1/12], 1)], [0.72, 0.2, 0.08], inf), \\amp, Pwhite(0.1, 0.28), \\dec, 0.03, \\pan, Pwhite(-0.5, 0.5))`,
    "house-16": `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.(["x-Xxx-Xxx-Xxx-Xx", "x-Xxx-Xxx-XxxXXX"], 0.28) * Pwhite(0.82, 1.12), \\dec, Pseq([0.025, 0.02, 0.13, 0.02], inf), \\hp, Pwrand([7800, 9800, 6200], [0.6, 0.28, 0.12], inf), \\pan, Pbrown(-0.32, 0.32, 0.12))`,   // 16ths with the open hat landing on every offbeat: shimmer and drive from one voice
    "kit-16": `~d.(\\d2, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.("hhHhhhHhhhHhhhHh"), \\amp, ~x.(["x-Xxx-Xxx-Xxx-Xx", "x-Xxx-Xxx-XxxXXX"], 0.34) * Pwhite(0.85, 1.1), \\dec, Pseq([0.05, 0.04, 0.2, 0.04], inf), \\pan, Pbrown(-0.3, 0.3, 0.1), \\send, 0.1)`,   // the open hat is the third buffer in the row, so it lands on every offbeat
    "kit-swung": `~d.(\\d2, \\instrument, \\smp, \\dur, ${swing}, \\buf, ~kp.("hhhHhhhhhhhHhhhh"), \\amp, ~x.(["X-xX-xX-X-xX-xXx", "X-xX-xX-X-xXxXXx"], 0.32), \\dec, Pwrand([0.05, 0.16], [0.85, 0.15], inf), \\pan, Pwhite(-0.35, 0.35), \\send, 0.1)`,
    "kit-offbeat": `~d.(\\d2, \\instrument, \\smp, \\dur, 1/2, \\buf, ~kp.("hH"), \\amp, Pseq([Rest(0), 0.3], inf) * Pwhite(0.8, 1.05), \\dec, 0.18, \\pan, Pbrown(-0.35, 0.35, 0.1), \\send, 0.12)`,   // the rest takes the closed hat, so what you hear on the and is the open one
    "kit-sparse": `~d.(\\d2, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.("h---h---H---h-h-"), \\amp, ~x.(["----------------", "--------x-------", "--x-----x-------", "--x-----x---x-x-"], 0.3), \\dec, Pseq([0.04, 0.03, 0.16, 0.03], inf), \\rate, Pwrand([1, 1.5, 0.7], [0.7, 0.2, 0.1], inf), \\crush, 0.55, \\fold, 0.3, \\pan, Pbrown(-0.4, 0.4, 0.15), \\send, 0.2)`,   // bar 1 is silence; a hit is added each bar, so the four-bar cycle IS the build
    // One silent event delays the rain by two beats. The pattern still activates on the first bar, so the booth can
    // prepare choices while the opening score reveals itself instead of waiting on six simultaneous fade-ins.
    "nature-rain": `~d.(\\d2, \\instrument, \\nature, \\buf, ~n.(\\rain), \\delta, Pseq([2, Pexprand(22, 31, inf)], 1), \\dur, 24, \\len, 22, \\att, 5, \\rel, 8, \\start, Pwhite(0.0, 0.7), \\rate, Pwhite(0.66, 0.86), \\hp, Pwrand([520, 520, 1500], [0.55, 0.25, 0.2], inf), \\lp, ~arc.(1800, 9500, 38), \\amp, Pseq([Rest(0), Pwrand([Pwhite(0.07, 0.1, 1), Pwhite(0.13, 0.17, 1), Rest(0)], [0.58, 0.14, 0.28], inf)], 1), \\pan, Pbrown(-0.38, 0.38, 0.08), \\send, 0.84)`,
    none: "",   // left for a DJ to fill
  } as Record<string, string>)[st.hats];

  const d3 = ({
    backbeat: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["----X-------X---", "----X-------X--x"], 0.5), \\send, ${f(0.3 + r() * 0.4)})`,
    snare: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["----X-------X---", "----X--x----X-x-"], 0.55), \\send, 0.2)`,
    three: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["--------X-------", "--------X-----x-"], 0.6), \\send, 0.6)`,
    rim: `~d.(\\d3, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("------X------X--", 0.22), \\freq, 900, \\dec, 0.04, \\click, 0.8, \\send, 0.8, \\pan, 0.3)`,
    congas: `~d.(\\d3, \\instrument, \\perc, \\dur, ${swing}, \\amp, ~x.(["--x-X--x-X--x-X-", "--x-X--x-X-xX-x-"], 0.28), \\freq, Pseq([${[0, 0, 4, 0, 2].map((d) => Math.round(440 * Math.pow(2, (deg(d, 2) - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.09, 0.16), \\click, 0.5, \\pan, Pseq([-0.35, 0.35, 0.1], inf), \\send, 0.25)`,
    poly: `~d.(\\d3, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("${ghosted(pick([5, 7]), 2, 1)}", 0.26), \\freq, Pseq([${[0, 4, 2].map((d) => Math.round(440 * Math.pow(2, (deg(d, 3) - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.06, 0.16), \\pan, Pwhite(-0.6, 0.6))`,   // a 5- or 7-step row against 16: it drifts
    "kit-perc": `~d.(\\d3, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.(["--s-C--s-s--C-t-", "--s-C--s-s--C-tt"]), \\amp, ~x.(["--x-X--x-x--X-x-", "--x-X--x-x--X-xx"], 0.5), \\pan, Pseq([-0.22, 0.04, 0.26, 0.04], inf), \\send, 0.45)`,   // clap on the backbeat, shaker between it, tambourine on the turnaround: one slot, three voices
    "kit-conga": `~d.(\\d3, \\instrument, \\smp, \\dur, ${swing}, \\buf, ~kp.(["--c-C--v-b--C-c-", "--c-C--v-b--C-vb"]), \\amp, ~x.(["--x-X--x-x--X-x-", "--x-X--x-x--X-xx"], 0.46), \\pan, Pseq([-0.3, 0.05, 0.3, 0.1], inf), \\send, 0.37)`,
    "kit-snare": `~d.(\\d3, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.(["----n------wn---", "----n------wn-ww"]), \\amp, ~x.(["----X------xX---", "----X------xX-xx"], 0.5), \\pan, Pseq([0, 0.3, 0, -0.2], inf), \\send, 0.32)`,
    "kit-tick": `~d.(\\d3, \\instrument, \\smp, \\dur, 1/4, \\buf, ~kp.("----m------m--s-"), \\amp, ~x.(["----------------", "----X-----------", "----X------x----", "----X------x--x-"], 0.42), \\rate, Prand([1, 1.7, 0.6, 2.2], inf), \\crush, 0.7, \\fold, 0.45, \\pan, Pwhite(-0.5, 0.5), \\send, 0.5)`,
    // Canopy is the final opening reveal, roughly eleven seconds after the first bar at 64 BPM. It stays distant:
    // recognisable birds above the tactile foreground, never a constant chirping layer.
    "nature-birds": `~d.(\\d3, \\instrument, \\nature, \\buf, ~n.(\\birds), \\delta, Pseq([12, Pexprand(34, 52, inf)], 1), \\dur, 40, \\len, 34, \\att, 8, \\rel, 12, \\start, Pwhite(0.05, 0.76), \\rate, Pwhite(0.78, 0.98), \\hp, 1250, \\lp, ~arc.(3000, 11000, 62), \\amp, Pseq([Rest(0), Pwrand([Pwhite(0.026, 0.046, 1), Pwhite(0.07, 0.1, 1), Rest(0)], [0.5, 0.12, 0.38], inf)], 1), \\pan, Pbrown(-0.62, 0.62, 0.12), \\send, 0.8)`,
    none: "",   // left for a DJ to fill
  } as Record<string, string>)[st.clap];

  const riff = (restP: number, octP: number) => { const xs: string[] = []; for (let i = 0; i < 16; i++) xs.push(i === 0 ? String(deg(0)) : chance(restP) ? "\\r" : chance(octP) ? String(deg(0, 1)) : chance(0.7) ? String(deg(0)) : String(deg(pick([2, 4, 6])))); return xs.join(", "); };
  const d4 = ({
    riff: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${riff(0.3, 0.2)}], inf), ${follow}, \\cutoff, Pseq([${[0, 1, 2, 3].map(() => int(350, 1500)).join(", ")}], inf).stutter(16), \\res, ${f(2.2 + r())}, \\duck, 0.4, \\amp, 0.6)`,
    sub: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, \\r, ${deg(0)}, \\r, \\r, ${deg(0)}, \\r, \\r, \\r, ${deg(0)}, \\r, \\r, \\r, ${deg(2)}, \\r], inf), ${follow}, \\cutoff, 260, \\res, 1.2, \\dec, 0.45, \\duck, 0.6, \\amp, 0.75)`,
    acid: `~d.(\\d4, \\instrument, \\acid, \\dur, 1/4, \\midinote, Pseq([${riff(0.25, 0.3)}], inf) + 12, ${follow}, \\cutoff, Pbrown(250, 1500, 130), \\env, Pwhite(1200, 4200), \\res, ${f(0.72 + r() * 0.22)}, \\dec, Pwrand([0.12, 0.32], [0.8, 0.2], inf), \\amp, 0.42)`,
    staccato: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${riff(0.45, 0.35)}], inf), ${follow}, \\cutoff, ${int(700, 1400)}, \\res, 2.8, \\dec, 0.09, \\amp, 0.6)`,
    "sub-bounce": `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, \\r, ${deg(0, 1)}, \\r, \\r, ${deg(0)}, \\r, \\r, ${deg(4)}, \\r, ${deg(0)}, \\r, \\r, ${deg(6)}, \\r], inf), ${follow}, \\cutoff, 420, \\res, 1.5, \\dec, 0.3, \\duck, 0.3, \\amp, 0.75)`,
    "one-note": `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, \\amp, ~x.(["--X--X--X--X-X--", "--X--X--X--XX-X-"], 0.6), \\cutoff, Pbrown(300, 1100, 80), \\res, 2.6, \\dec, 0.14)`,
    pump: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, ${follow}, \\amp, ~x.(["-xXx-xXx-xXx-xXx", "-xXx-xXx-xXx-xXX"], 1.0), \\cutoff, Pseq([600, 850, 1200, 1700], inf).stutter(16), \\res, 2.2, \\dec, 0.15, \\duck, 0.32)`,   // sits up against a sampled kick, which is louder than the synth one
    offbeat: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, ${follow}, \\amp, ~x.("-xXx-xXx-xXx-xXx", 0.62), \\cutoff, Pseq([500, 700, 1000, 1500], inf).stutter(16), \\res, 2.2, \\dec, 0.13, \\duck, 0.5)`,
    reese: `~d.(\\d4, \\instrument, \\bass, \\dur, Pseq([3/2, 1, 3/2], inf), \\midinote, Pseq([${deg(0)}, ${deg(0)}, ${deg(6, -1)}], inf), ${follow.replace(".stutter(16)", ".stutter(3)")}, \\cutoff, Pbrown(220, 700, 60), \\res, 3.2, \\dec, 1.1, \\duck, 0.5, \\amp, 0.7)`,
    round: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, \\r, ${deg(0)}, \\r, \\r, ${deg(4)}, \\r, ${deg(0)}, \\r, \\r, ${deg(2)}, \\r, ${deg(0, 1)}, \\r, \\r], inf), ${follow}, \\cutoff, ${int(480, 760)}, \\res, 1.1, \\dec, 0.32, \\duck, 0.45, \\amp, 0.7)`,
    "offbeat-round": `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, ${follow}, \\amp, ~x.(["--X--X--X-X--X--", "--X--X--X-X-X-x-"], 0.7), \\cutoff, ${int(500, 800)}, \\res, 1.2, \\dec, 0.24, \\duck, 0.4)`,
    disco: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(0)}, \\r, ${deg(0, 1)}, ${deg(0)}, ${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(4)}, \\r, ${deg(0, 1)}, ${deg(6)}], inf), ${follow}, \\cutoff, Pseq([700, 900, 1200, 1500], inf).stutter(16), \\res, 1.4, \\dec, 0.16, \\duck, 0.4, \\amp, 0.85)`,
    "saw-octaves": `~d.(\\d4, \\instrument, \\supersaw, \\dur, Pseq([2, 0.75, 1.25, 2, 1.5, 0.5], inf), \\midinote, Pseq([[${deg(0)}, ${deg(0, 1)}], [${deg(0)}, ${deg(0, 1)}], [${deg(4, -1)}, ${deg(4)}], [${deg(5, -1)}, ${deg(5)}]], inf), ${slow}, \\detune, ${f(0.15 + r() * 0.2)}, \\cutoff, ${int(300, 600)}, \\env, ${int(300, 900)}, \\res, 0.25, \\att, 0.01, \\sus, 0.45, \\rel, 0.35, \\spread, 0.35, \\send, 0.35, \\duck, 0.6, \\amp, 0.32)`,
    octaves: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, ${deg(0, 1)}, ${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(0)}, ${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(4)}, \\r, ${deg(0, 1)}, \\r], inf), ${follow}, \\cutoff, ${int(600, 1100)}, \\res, 2, \\dec, 0.16, \\duck, 0.35, \\amp, 0.62)`,
    "sub-gap": `~d.(\\d4, \\instrument, \\bass, \\delta, 1/4, \\dur, 0.6, \\midinote, ${deg(0)}, ${follow}, \\amp, ~x.(["X-------X-------", "X-------X-------", "X-------X---X---", "X---X---X---X-X-"], 0.7), \\cutoff, Pseg([300, 900, 400], 4, repeats: inf), \\res, 1.6, \\dec, 0.5, \\crush, 0.4, \\fold, 0.5, \\duck, 0.8)`,   // \\dur longer than \\delta: notes ring into each other instead of sitting in their own box
    "ambient-drone": `~d.(\\d4, \\instrument, \\cloud, \\buf, ~g.(\\brush), \\delta, Pseq([4, Pexprand(11, 19, inf)], 1), \\dur, 18, \\rate, Pwrand([0.29, 0.38, 0.51, 1.25], [0.18, 0.44, 0.24, 0.14], inf), \\pos, Pbrown(0.06, 0.86, 0.045), \\wander, 0.1, \\grain, Pwhite(0.14, 0.48), \\density, Pwrand([Pwhite(5, 11, 1), Pwhite(17, 38, 1)], [0.62, 0.38], inf), \\att, 2.2, \\sus, 11, \\rel, 5.5, \\hp, 48, \\lp, ~arc.(780, 7800, 64), \\spread, 0.86, \\shimmer, Pwrand([0.022, 0.16], [0.75, 0.25], inf), \\amp, Pseq([Rest(0), Pwhite(0.19, 0.25, inf)], 1), \\send, 0.66)`,
  } as Record<string, string>)[st.bass];

  const d5 = ({
    none: "",
    stabs: `~d.(\\d5, \\instrument, \\stab, \\dur, 1/4, \\amp, ~x.(["----X---------X-", "----X--X------X-"], 0.36), \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf).stutter(16), \\cutoff, Pbrown(900, 2600, 200), \\dec, 0.15, \\send, 0.9)`,
    "dub-chord": `~d.(\\d5, \\instrument, \\stab, \\dur, 1/4, \\amp, ~x.(["------X---------", "------X------x--"], 0.48), \\midinote, ${chord(0, 2)}, \\cutoff, Pbrown(600, 1900, 150), \\dec, 0.12, \\send, 0.9)`,
    organ: `~d.(\\d5, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.(["--X--X----X--X--", "--X--X----X-X-X-"], 0.264), \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf).stutter(16), \\ratio, 1, \\index, 1.4, \\dec, 0.18, \\send, 0.63)`,
    choir: `~d.(\\d5, \\instrument, \\choir, \\dur, 4, \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf), \\vowel, Pseq([0, 3, 4, 1], inf), \\sus, ${f((60 / bpm) * 3)}, \\att, 0.5, \\rel, ${f((60 / bpm) * 1.5)}, \\duck, 0.7, \\amp, 0.24)`,
    epiano: `~d.(\\d5, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.(["--X--X----X-----", "--X--X----X--X--"], 0.24), \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf).stutter(16), \\ratio, 1, \\index, Pwhite(0.9, 1.6), \\dec, 0.7, \\send, 0.81)`,
    "filter-stabs": `~d.(\\d5, \\instrument, \\stab, \\dur, 1/4, \\amp, ~x.(["X-x-X-x-X-x-X-x-", "X-x-X-x-X-xXX-x-"], 0.5), \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf).stutter(16), \\cutoff, Pseq([500, 800, 1400, 2600, 4200, 2600, 1400, 800], inf).stutter(8), \\dec, 0.13, \\send, 0.63)`,
    "warm-pad": `~d.(\\d5, \\instrument, \\pad, \\dur, 4, \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf), \\sus, ${f((60 / bpm) * 3.2)}, \\att, 0.5, \\rel, ${f((60 / bpm) * 1.6)}, \\cutoff, Pwhite(1700, 3000), \\duck, 0.8, \\amp, 0.216)`,
    "choir-warm": `~d.(\\d5, \\instrument, \\choir, \\dur, 4, \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf), \\vowel, Pseq([0, 3, 0, 4], inf), \\sus, ${f((60 / bpm) * 3)}, \\att, 0.4, \\rel, ${f((60 / bpm) * 1.5)}, \\bright, 1.1, \\duck, 0.8, \\amp, 0.24)`,
    marimba: `~d.(\\d5, \\instrument, \\fm, \\dur, ${swing}, \\amp, ~x.(["X--X--X---X--X--", "X--X--X---X-X-X-"], 0.312), \\midinote, Pseq([${prog.map((d) => `${deg(d, 3)}, ${deg(d + 2, 3)}, ${deg(d + 4, 3)}, ${deg(d + 2, 3)}`).join(", ")}], inf).stutter(4), \\ratio, 3.5, \\index, 0.9, \\dec, 0.22, \\pan, Pwhite(-0.4, 0.4), \\send, 0.63)`,
    "saw-pad": `~d.(\\d5, \\instrument, \\supersaw, \\dur, 4, \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf), \\detune, 0.5, \\cutoff, Pwhite(500, 900), \\env, Pwhite(1800, 3400), \\res, 0.3, \\att, ${f((60 / bpm) * 1.2)}, \\sus, ${f((60 / bpm) * 2.4)}, \\rel, ${f((60 / bpm) * 2)}, \\spread, 1, \\send, 0.85, \\duck, 0.55, \\amp, 0.2)`,
    pad: `~d.(\\d5, \\instrument, \\pad, \\dur, 4, \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf), \\sus, ${f((60 / bpm) * 3)}, \\att, 0.4, \\rel, ${f((60 / bpm) * 1.5)}, \\cutoff, Pwhite(800, 2000), \\duck, 0.75, \\amp, 0.204)`,
    "piano-riff": `~d.(\\d5, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.(["--X-X--X--X-X--X", "--X-X--X--X-XXX-"], 0.3) * Pwhite(0.85, 1.12), \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf).stutter(16), \\ratio, 1, \\index, Pwhite(1.2, 2.2), \\dec, Pwrand([0.26, 0.5], [0.72, 0.28], inf), \\pan, Pwhite(-0.14, 0.14), \\send, 0.72)`,   // the syncopated piano house riff: short and percussive, on the ands, not sustained pad chords
    "kit-piano": `~d.(\\d5, \\instrument, \\keys, \\dur, 1/4, \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf).stutter(16), \\buf, ~kf, \\rootfreq, ~kr, \\amp, ~x.(["--X-X--X--X-X--X", "--X-XX-X--X-XXX-"], 0.42) * Pwhite(0.85, 1.1), \\dec, Pwrand([0.3, 0.65], [0.7, 0.3], inf), \\rel, 0.2, \\wow, 0.004, \\flut, 0.0015, \\pan, Pwhite(-0.12, 0.12), \\duck, 0.3, \\send, 0.4)`,
    "keys-wide": `~d.(\\d5, \\instrument, \\keys, \\delta, 1/4, \\dur, 2.5, \\midinote, Pseq([${prog.map((d) => ninth(d, 2)).join(", ")}], inf).stutter(16), \\buf, ~kf, \\rootfreq, ~kr, \\amp, ~x.(["X---------------", "X---------------", "X-----------X---", "X-------X---X---"], 0.4), \\dec, 1.2, \\rel, 0.6, \\crush, 0.5, \\fold, 0.25, \\pan, Pwhite(-0.1, 0.1), \\duck, 0.7, \\send, 0.6)`,
    // Paper replaces the old porcelain voice: close, warm movement without a pitched strike or ceremonial tail.
    "ambient-pad": `~d.(\\d5, \\instrument, \\texture, \\buf, ~t.(\\paper), \\delta, Pseq([8, Pwrand([~burst.(2, 9, 0.6, 0.45, 1), ~burst.(3, 14, 0.45, 0.55, 1), ~burst.(1, 19, 0.5, 0.4, 1)], [0.4, 0.33, 0.27], inf)], 1), \\len, Pwhite(3.4, 5.8), \\rel, Pwhite(0.7, 1.25), \\start, Pbrown(0.03, 0.82, 0.06), \\rate, Pwrand([0.48, 0.59, 0.72], [0.2, 0.58, 0.22], inf), \\hp, 85, \\lp, ~arc.(1500, 8600, 44), \\amp, Pseq([Rest(0), Pwhite(0.17, 0.25, inf)], 1), \\pan, Pbrown(-0.72, 0.72, 0.16), \\send, 0.48)`,
  } as Record<string, string>)[st.chords];

  const motif = () => { let p = int(0, 4); return Array.from({ length: 8 }, () => { p = Math.max(0, Math.min(7, p + int(-2, 2))); return chance(0.2) ? "\\r" : String(deg([0, 2, 4, 5, 7, 9, 11, 14][p] % 7 + (p > 4 ? 7 : 0), 3)); }); };
  const A = motif(), B = motif();
  // a hook that always moves: chord tones plus a passing 2nd. motif()'s random walk can stall on one note, which is
  // fine under a sparse pad and dead as a top line.
  const HOOK = (st.lead !== "kit-top" && st.lead !== "piano-top" && st.lead !== "hyper-saw") ? [] : (() => { const s = pick([[0, 4, 7, 4, 2, 4, 0, 2], [4, 2, 0, 2, 4, 7, 4, 2], [7, 4, 2, 4, 0, 2, 4, 7], [0, 2, 4, 7, 4, 2, 4, 0]]); return [...s, ...s.slice(4), ...s.slice(0, 4)].map((d) => deg(d, 3)); })();
  const d6 = ({
    "saw-arp": `~d.(\\d6, \\instrument, \\supersaw, \\dur, 1/4, \\midinote, Pseq([${[0, 5, 4, 2, 0, 4].map((d, i) => deg(d, i < 3 ? 3 : 2)).join(", ")}], inf), ${slow}, \\detune, 0.35, \\cutoff, 300, \\env, Pseq([600, 1100, 2000, 3400, 2400, 1400], inf).stutter(16), \\res, ${f(0.35 + r() * 0.25)}, \\att, 0, \\sus, 0.09, \\rel, 0.12, \\spread, 0.9, \\send, 0.7, \\amp, 0.13)`,
    pluck: `~d.(\\d6, \\instrument, \\fm, \\dur, ${pick(["1/2", "3/4"])}, \\midinote, Prand([${[0, 2, 4, 7, 9, 11].map((d) => deg(d, 3)).join(", ")}, \\r, \\r], inf), ${follow.replace(".stutter(16)", ".stutter(8)")}, \\ratio, 2, \\index, Pwhite(0.6, 1.8), \\dec, Pwhite(0.18, 0.4), \\amp, 0.1, \\pan, Pwhite(-0.6, 0.6), \\send, 0.9)`,
    "arp-bright": `~d.(\\d6, \\instrument, \\fm, \\dur, 1/4, \\midinote, Pseq([${[...A, ...A, ...B, ...A].join(", ")}], inf), ${follow}, \\ratio, 2, \\index, Pbrown(0.6, 2, 0.2), \\dec, 0.16, \\amp, 0.085, \\pan, Pbrown(-0.6, 0.6, 0.15), \\send, 0.9)`,
    "epiano-melody": `~d.(\\d6, \\instrument, \\fm, \\dur, 1/2, \\midinote, Pseq([${[...A, ...B].join(", ")}], inf), ${follow.replace(".stutter(16)", ".stutter(8)")}, \\ratio, 1, \\index, Pwhite(1.0, 2.0), \\dec, Pwhite(0.5, 1.0), \\amp, 0.11, \\pan, Pbrown(-0.4, 0.4, 0.1), \\send, 0.9)`,
    "choir-ooh": `~d.(\\d6, \\instrument, \\choir, \\dur, 4, \\midinote, Pseq([[${deg(4, 3)}, ${deg(7, 3)}], [${deg(2, 3)}, ${deg(5, 3)}]], inf), ${follow.replace(".stutter(16)", "")}, \\vowel, 3.4, \\sus, ${f((60 / bpm) * 3)}, \\att, 0.8, \\rel, 1.8, \\bright, 0.95, \\duck, 0.5, \\amp, 0.154)`,   // one chord per bar, transposed with the progression: held static it droned through every chord change
    arp: `~d.(\\d6, \\instrument, \\fm, \\dur, 1/4, \\midinote, Pseq([${[...A, ...A, ...B, ...A].join(", ")}], inf), ${follow.replace(".stutter(16)", ".stutter(16)")}, \\ratio, ${pick([2, 3.5])}, \\index, Pbrown(0.8, 4, 0.4), \\dec, Pwhite(0.12, 0.3), \\amp, 0.11, \\pan, Pbrown(-0.6, 0.6, 0.15), \\send, 0.9)`,
    "fm-sparse": `~d.(\\d6, \\instrument, \\fm, \\dur, ${pick(["3/4", "1/2"])}, \\midinote, Prand([${[0, 2, 4, 7, 9].map((d) => deg(d, 3)).join(", ")}, \\r, \\r, \\r], inf), \\ratio, ${pick([2, 3.5, 7.1])}, \\index, Pwhite(1.0, 5.0), \\dec, Pwhite(0.2, 0.8), \\amp, 0.12, \\pan, Pwhite(-0.7, 0.7), \\send, 0.9)`,
    zaps: `~d.(\\d6, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.("${ghosted(16, 3, int(0, 5))}", 0.14), \\midinote, Prand([${[0, 4, 7].map((d) => deg(d, 4)).join(", ")}], inf), \\ratio, 7.1, \\index, Pwhite(4.0, 9.0), \\dec, 0.07, \\pan, Pwhite(-0.8, 0.8), \\send, 0.72)`,
    blips: `~d.(\\d6, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("${ghosted(pick([7, 9, 11]), 3, 2)}", 0.2), \\freq, Prand([${[0, 2, 4].map((d) => Math.round(440 * Math.pow(2, (deg(d, 4) - 69) / 12))).join(", ")}], inf), \\dec, 0.05, \\click, 0.1, \\pan, Pwhite(-0.7, 0.7), \\send, 0.9)`,
    toms: `~d.(\\d6, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.(["${ghosted(16, 5, 3)}", "${ghosted(16, 7, 1)}"], 0.3), \\freq, Pseq([${[0, 2, 4, 2].map((d) => Math.round(440 * Math.pow(2, (deg(d, 2) - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.1, 0.22), \\pan, Pseq([-0.5, 0.5], inf), \\send, 0.54)`,
    pad: `~d.(\\d6, \\instrument, \\pad, \\dur, 8, \\midinote, Pseq([${chord(0, 3)}, ${chord(prog[1], 3)}], inf), \\sus, ${f((60 / bpm) * 6)}, \\att, 1.5, \\rel, 3, \\cutoff, Pwhite(1200, 3000), \\duck, 0.5, \\amp, 0.11)`,
    "piano-top": `~d.(\\d6, \\instrument, \\pluck, \\dur, 1/4, \\amp, ~x.(["X-x-X--x--X-x--X", "X-x-X--x--X-xXX-"], 0.15), \\midinote, Pseq([${HOOK.join(", ")}], inf), ${follow}, \\dec, Pwhite(0.4, 0.95), \\tone, Pwhite(0.45, 0.85), \\pan, Pbrown(-0.45, 0.45, 0.15), \\send, 0.7)`,   // a plucked hook over the riff, rhythm from the amp row so it sings instead of running 16ths
    "kit-top": `~d.(\\d6, \\instrument, \\keys, \\dur, 1/4, \\midinote, Pseq([${HOOK.join(", ")}], inf), ${follow}, \\buf, ~kf, \\rootfreq, ~kr, \\amp, ~x.(["X-x-X--x--X-x--X", "X-x-X--x--X-xXX-"], 0.4), \\dec, Pwhite(0.5, 1.2), \\rel, 0.3, \\wow, 0.005, \\flut, 0.002, \\pan, Pbrown(-0.4, 0.4, 0.15), \\send, 0.45)`,
    "gendy-blips": `~d.(\\d6, \\instrument, \\gendy, \\delta, Pexprand(0.06, 0.5, inf), \\dur, 0.12, \\midinote, Prand([${[0, 2, 4, 7].map((d) => deg(d, 3)).join(", ")}], inf) + Pwhite(-0.2, 0.2), \\knum, 6, \\chaos, 0.7, \\cutoff, Pseg([1200, 5000, 2000], 6, repeats: inf), \\crush, 0.6, \\fold, 0.4, \\dec, 0.1, \\amp, 0.22, \\pan, Pwhite(-0.7, 0.7), \\send, 0.6)`,   // Pexprand on \\delta: off the grid entirely, clustered then sparse. Fractional detune per hit.
    none: "",   // left for a DJ to fill
    "hyper-saw": `~d.(\\d6, \\instrument, \\supersaw, \\dur, 1/4, \\midinote, Pseq([${HOOK.join(", ")}], inf), ${follow}, \\amp, ~x.(["X---X-------X---", "X---X---X-x-X-xX"], 0.3), \\detune, 0.85, \\spread, 1, \\bend, Pwrand([0, -12, 7], [0.6, 0.25, 0.15], inf), \\bendt, 0.06, \\drive, 6, \\ring, Pwrand([0, 0.45], [0.75, 0.25], inf), \\ringf, 520, \\crush, 0.45, \\fold, 0.3, \\cutoff, 900, \\env, 6000, \\res, 0.55, \\att, 0.002, \\sus, 0.1, \\rel, 0.2, \\duck, 0.85, \\send, 0.5)`,
    // The first audible gesture is close and physical. A short pair catches attention, then long holes keep it from
    // becoming a shaker loop while the field recordings arrive around it.
    "ambient-motes": `~d.(\\d6, \\instrument, \\texture, \\buf, ~t.(\\fingertips), \\delta, Pseq([0.6, 0.38, 3.75, 1.1, 6.5, Pwrand([~burst.(3, 7, 0.34, 0.45, 1), ~burst.(2, 12, 0.5, 0.4, 1)], [0.55, 0.45], inf)], 1), \\len, Pwhite(2.6, 4.8), \\rel, Pwhite(0.55, 0.9), \\rate, Pwrand([0.34, 0.46, 0.57, 0.69], [0.14, 0.2, 0.46, 0.2], inf), \\hp, 48, \\lp, ~arc.(1400, 7600, 30), \\sub, Pwrand([Pwhite(0.2, 0.36, 1), Pwhite(0.55, 0.85, 1)], [0.68, 0.32], inf), \\subfreq, Pwhite(38, 58), \\amp, Pwhite(0.13, 0.2), \\pan, Pbrown(-0.68, 0.68, 0.15), \\send, 0.54)`,
  } as Record<string, string>)[st.lead];

  const about = ambient ? "water → touch → grain → paper → canopy" : `${st.name} · ${prog.map((d) => (st.mood === "vibey" ? ["I", "ii", "iii", "IV", "V", "vi", "vii"] : ["i", "ii", "III", "iv", "v", "VI", "VII"])[d]).join("–")}`;
  return { seed, style: st.name, mood: st.mood, bpm, root, scale: scaleName, key: `${NOTE[root % 12]} ${scaleName}`, slots: { d1, d2, d3, d4, d5, d6 }, about };
}
