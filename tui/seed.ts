// A new base for the set from one number. A seed picks a STYLE first, and the style decides how everything else is
// rolled, so the six slots belong together: tempo range, kick figure, hat feel and swing, what the bass does, a
// chord progression the bass follows (\ctranspose), and a lead. Grooves turn around every fourth bar (A A A B rows),
// and patterns carry their own randomness, so even one seed never loops identically.
export interface Base { seed: number; style: string; bpm: number; root: number; scale: string; key: string; slots: Record<string, string>; about: string }

const SCALES: Record<string, number[]> = { minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], "harmonic minor": [0, 2, 3, 5, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PROGRESSIONS = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 0, 3, 0], [0, 2, 3, 5], [0, 0, 5, 6]];   // scale degrees, one per bar

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const f = (x: number) => String(+x.toFixed(3));

interface Style { name: string; bpm: [number, number]; scales: string[]; kick: string[][]; hats: string; clap: string; bass: string; chords: string; lead: string; swing?: number }
const STYLES: Style[] = [
  { name: "detroit", bpm: [126, 132], scales: ["minor", "dorian"], kick: [["X---X---X---X---", "X---X---X---X-x-"]], hats: "sixteenths", clap: "backbeat", bass: "riff", chords: "stabs", lead: "fm-sparse" },
  { name: "dub techno", bpm: [118, 124], scales: ["minor", "dorian"], kick: [["X---X---X---X---"]], hats: "offbeat", clap: "rim", bass: "sub", chords: "dub-chord", lead: "pad" },
  { name: "acid", bpm: [128, 136], scales: ["phrygian", "minor"], kick: [["X---X---X---X---", "X---X---X--XX---"]], hats: "sixteenths", clap: "backbeat", bass: "acid", chords: "none", lead: "toms" },
  { name: "electro", bpm: [124, 130], scales: ["minor", "phrygian"], kick: [["X--X--X---X--X--", "X--X--X---X-X-X-"], ["X-----X-X-----X-", "X-----X-X--X--X-"]], hats: "sixteenths", clap: "snare", bass: "staccato", chords: "stabs", lead: "zaps" },
  { name: "two-step", bpm: [130, 134], scales: ["minor", "dorian"], kick: [["X---------X-----", "X------X--X-----"]], hats: "swung", clap: "backbeat", bass: "sub-bounce", chords: "organ", lead: "fm-sparse", swing: 0.045 },
  { name: "minimal", bpm: [124, 128], scales: ["minor", "mixolydian"], kick: [["X---X---X---X---"]], hats: "euclid", clap: "poly", bass: "one-note", chords: "none", lead: "blips" },
  { name: "progressive", bpm: [128, 134], scales: ["minor", "harmonic minor"], kick: [["X---X---X---X---"]], hats: "offbeat-open", clap: "backbeat", bass: "offbeat", chords: "pad", lead: "arp" },
  { name: "halftime", bpm: [140, 150], scales: ["minor", "phrygian"], kick: [["X---------X-----", "X--------XX-----"]], hats: "rolls", clap: "three", bass: "reese", chords: "pad", lead: "fm-sparse" },
  { name: "house", bpm: [120, 126], scales: ["dorian", "mixolydian", "minor"], kick: [["X---X---X---X---", "X---X---X---X--x"]], hats: "offbeat-open", clap: "backbeat", bass: "octaves", chords: "organ", lead: "arp", swing: 0.02 },
];

export function makeBase(seed: number): Base {
  const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)], chance = (p: number) => r() < p, int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const st = pick(STYLES), bpm = int(st.bpm[0] / 2, st.bpm[1] / 2) * 2, rootPc = int(0, 11), root = 26 + ((rootPc + 10) % 12);   // bass root D1..C#2
  const scaleName = pick(st.scales), sc = SCALES[scaleName], prog = pick(PROGRESSIONS);
  const deg = (d: number, oct = 0) => root + oct * 12 + sc[((d % sc.length) + sc.length) % sc.length] + Math.floor(d / sc.length) * 12;
  const offs = prog.map((d) => { const o = sc[d % sc.length]; return o > 6 ? o - 12 : o; });                      // chord roots as semitone offsets, kept near the tonic
  const follow = `\\ctranspose, Pseq([${offs.join(", ")}], inf).stutter(16)`;
  const chord = (d: number, oct: number) => `[${[0, 2, 4, 6].map((k) => deg(d + k, oct)).map((m) => (m > 79 ? m - 12 : m)).join(", ")}]`;
  const rows = (xs: string[]) => (xs.length === 1 ? `"${xs[0]}"` : `["${xs[0]}", "${xs[0]}", "${xs[0]}", "${xs[1]}"]`);
  const swing = st.swing ? `Pseq([${f(0.25 + st.swing)}, ${f(0.25 - st.swing)}], inf)` : "1/4";
  const ghosted = (n: number, k: number, rot: number) => Array.from({ length: n }, (_, i) => (((i + rot) * k) % n < k ? (chance(0.35) ? "x" : "X") : "-")).join("");

  const d1 = `~d.(\\d1, \\instrument, \\kick, \\dur, 1/4, \\amp, ~x.(${rows(pick(st.kick))}, 0.9), \\tune, ${pick([38, 41, 44, 48])}, \\dec, ${st.name === "dub techno" ? 0.5 : pick([0.26, 0.32, 0.4])}, \\drive, ${st.name === "electro" || st.name === "acid" ? 2.2 : pick([1.2, 1.6])})`;

  const d2 = ({
    sixteenths: `~d.(\\d2, \\instrument, \\hat, \\dur, ${swing}, \\amp, Pseq([0.1, 0.16, 0.28, 0.16], inf) * Pwhite(0.75, 1.1), \\dec, Pwrand([0.03, 0.13], [0.9, 0.1], inf), \\pan, Pwhite(-0.35, 0.35))`,
    offbeat: `~d.(\\d2, \\instrument, \\hat, \\dur, 1/2, \\amp, Pseq([Rest(0), 0.2], inf) * Pwhite(0.7, 1.0), \\dec, 0.05, \\hp, ${pick([7000, 9000])}, \\pan, Pbrown(-0.4, 0.4, 0.1))`,
    "offbeat-open": `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.("x-X-x-X-x-X-x-X-", 0.3), \\dec, Pseq([0.03, 0.03, 0.15, 0.03], inf), \\hp, 7500)`,
    swung: `~d.(\\d2, \\instrument, \\hat, \\dur, ${swing}, \\amp, ~x.(["X-xX-xX-X-xX-xXx", "X-xX-xX-X-xXxXXx"], 0.26), \\dec, Pwrand([0.03, 0.1], [0.85, 0.15], inf), \\pan, Pwhite(-0.4, 0.4))`,
    euclid: `~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, ~x.("${ghosted(16, pick([7, 9, 11]), int(0, 3))}", 0.26), \\dec, 0.03, \\pan, Pbrown(-0.5, 0.5, 0.2))`,
    rolls: `~d.(\\d2, \\instrument, \\hat, \\dur, Pwrand([Pseq([1/4], 1), Pseq([1/8, 1/8], 1), Pseq([1/12, 1/12, 1/12], 1)], [0.72, 0.2, 0.08], inf), \\amp, Pwhite(0.1, 0.28), \\dec, 0.03, \\pan, Pwhite(-0.5, 0.5))`,
  } as Record<string, string>)[st.hats];

  const d3 = ({
    backbeat: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["----X-------X---", "----X-------X--x"], 0.5), \\send, ${f(0.3 + r() * 0.4)})`,
    snare: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["----X-------X---", "----X--x----X-x-"], 0.55), \\send, 0.2)`,
    three: `~d.(\\d3, \\instrument, \\clap, \\dur, 1/4, \\amp, ~x.(["--------X-------", "--------X-----x-"], 0.6), \\send, 0.6)`,
    rim: `~d.(\\d3, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("------X------X--", 0.22), \\freq, 900, \\dec, 0.04, \\click, 0.8, \\send, 0.8, \\pan, 0.3)`,
    poly: `~d.(\\d3, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("${ghosted(pick([5, 7]), 2, 1)}", 0.26), \\freq, Pseq([${[0, 4, 2].map((d) => Math.round(440 * Math.pow(2, (deg(d, 3) - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.06, 0.16), \\pan, Pwhite(-0.6, 0.6))`,   // a 5- or 7-step row against 16: it drifts
  } as Record<string, string>)[st.clap];

  const riff = (restP: number, octP: number) => { const xs: string[] = []; for (let i = 0; i < 16; i++) xs.push(i === 0 ? String(deg(0)) : chance(restP) ? "\\r" : chance(octP) ? String(deg(0, 1)) : chance(0.7) ? String(deg(0)) : String(deg(pick([2, 4, 6])))); return xs.join(", "); };
  const d4 = ({
    riff: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${riff(0.3, 0.2)}], inf), ${follow}, \\cutoff, Pseq([${[0, 1, 2, 3].map(() => int(350, 1500)).join(", ")}], inf).stutter(16), \\res, ${f(2.2 + r())}, \\duck, 0.4, \\amp, 0.6)`,
    sub: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, \\r, ${deg(0)}, \\r, \\r, ${deg(0)}, \\r, \\r, \\r, ${deg(0)}, \\r, \\r, \\r, ${deg(2)}, \\r], inf), ${follow}, \\cutoff, 260, \\res, 1.2, \\dec, 0.45, \\duck, 0.6, \\amp, 0.75)`,
    acid: `~d.(\\d4, \\instrument, \\acid, \\dur, 1/4, \\midinote, Pseq([${riff(0.25, 0.3)}], inf) + 12, ${follow}, \\cutoff, Pbrown(250, 1500, 130), \\env, Pwhite(1200, 4200), \\res, ${f(0.72 + r() * 0.22)}, \\dec, Pwrand([0.12, 0.32], [0.8, 0.2], inf), \\amp, 0.42)`,
    staccato: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${riff(0.45, 0.35)}], inf), ${follow}, \\cutoff, ${int(700, 1400)}, \\res, 2.8, \\dec, 0.09, \\amp, 0.6)`,
    "sub-bounce": `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, \\r, ${deg(0, 1)}, \\r, \\r, ${deg(0)}, \\r, \\r, ${deg(4)}, \\r, ${deg(0)}, \\r, \\r, ${deg(6)}, \\r], inf), ${follow}, \\cutoff, 420, \\res, 1.5, \\dec, 0.3, \\duck, 0.3, \\amp, 0.75)`,
    "one-note": `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, \\amp, ~x.(["--X--X--X--X-X--", "--X--X--X--XX-X-"], 0.6), \\cutoff, Pbrown(300, 1100, 80), \\res, 2.6, \\dec, 0.14)`,
    offbeat: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, ${deg(0)}, ${follow}, \\amp, ~x.("-xXx-xXx-xXx-xXx", 0.62), \\cutoff, Pseq([500, 700, 1000, 1500], inf).stutter(16), \\res, 2.2, \\dec, 0.13, \\duck, 0.5)`,
    reese: `~d.(\\d4, \\instrument, \\bass, \\dur, Pseq([3/2, 1, 3/2], inf), \\midinote, Pseq([${deg(0)}, ${deg(0)}, ${deg(6, -1)}], inf), ${follow.replace(".stutter(16)", ".stutter(3)")}, \\cutoff, Pbrown(220, 700, 60), \\res, 3.2, \\dec, 1.1, \\duck, 0.5, \\amp, 0.7)`,
    octaves: `~d.(\\d4, \\instrument, \\bass, \\dur, 1/4, \\midinote, Pseq([${deg(0)}, \\r, ${deg(0, 1)}, ${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(0)}, ${deg(0)}, \\r, ${deg(0, 1)}, \\r, ${deg(4)}, \\r, ${deg(0, 1)}, \\r], inf), ${follow}, \\cutoff, ${int(600, 1100)}, \\res, 2, \\dec, 0.16, \\duck, 0.35, \\amp, 0.62)`,
  } as Record<string, string>)[st.bass];

  const d5 = ({
    none: "",
    stabs: `~d.(\\d5, \\instrument, \\stab, \\dur, 1/4, \\amp, ~x.(["----X---------X-", "----X--X------X-"], 0.15), \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf).stutter(16), \\cutoff, Pbrown(900, 2600, 200), \\dec, 0.15, \\send, 1)`,
    "dub-chord": `~d.(\\d5, \\instrument, \\stab, \\dur, 1/4, \\amp, ~x.(["------X---------", "------X------x--"], 0.2), \\midinote, ${chord(0, 2)}, \\cutoff, Pbrown(600, 1900, 150), \\dec, 0.12, \\send, 1)`,
    organ: `~d.(\\d5, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.(["--X--X----X--X--", "--X--X----X-X-X-"], 0.11), \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf).stutter(16), \\ratio, 1, \\index, 1.4, \\dec, 0.18, \\send, 0.35)`,
    pad: `~d.(\\d5, \\instrument, \\pad, \\dur, 4, \\midinote, Pseq([${prog.map((d) => chord(d, 2)).join(", ")}], inf), \\sus, ${f((60 / bpm) * 3)}, \\att, 0.4, \\rel, ${f((60 / bpm) * 1.5)}, \\cutoff, Pwhite(800, 2000), \\duck, 0.75, \\amp, 0.085)`,
  } as Record<string, string>)[st.chords];

  const motif = () => { let p = int(0, 4); return Array.from({ length: 8 }, () => { p = Math.max(0, Math.min(7, p + int(-2, 2))); return chance(0.2) ? "\\r" : String(deg([0, 2, 4, 5, 7, 9, 11, 14][p] % 7 + (p > 4 ? 7 : 0), 3)); }); };
  const A = motif(), B = motif();
  const d6 = ({
    arp: `~d.(\\d6, \\instrument, \\fm, \\dur, 1/4, \\midinote, Pseq([${[...A, ...A, ...B, ...A].join(", ")}], inf), ${follow.replace(".stutter(16)", ".stutter(16)")}, \\ratio, ${pick([2, 3.5])}, \\index, Pbrown(0.8, 4, 0.4), \\dec, Pwhite(0.12, 0.3), \\amp, 0.11, \\pan, Pbrown(-0.6, 0.6, 0.15), \\send, 0.7)`,
    "fm-sparse": `~d.(\\d6, \\instrument, \\fm, \\dur, ${pick(["3/4", "1/2"])}, \\midinote, Prand([${[0, 2, 4, 7, 9].map((d) => deg(d, 3)).join(", ")}, \\r, \\r, \\r], inf), \\ratio, ${pick([2, 3.5, 7.1])}, \\index, Pwhite(1.0, 5.0), \\dec, Pwhite(0.2, 0.8), \\amp, 0.12, \\pan, Pwhite(-0.7, 0.7), \\send, 0.8)`,
    zaps: `~d.(\\d6, \\instrument, \\fm, \\dur, 1/4, \\amp, ~x.("${ghosted(16, 3, int(0, 5))}", 0.14), \\midinote, Prand([${[0, 4, 7].map((d) => deg(d, 4)).join(", ")}], inf), \\ratio, 7.1, \\index, Pwhite(4.0, 9.0), \\dec, 0.07, \\pan, Pwhite(-0.8, 0.8), \\send, 0.4)`,
    blips: `~d.(\\d6, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.("${ghosted(pick([7, 9, 11]), 3, 2)}", 0.2), \\freq, Prand([${[0, 2, 4].map((d) => Math.round(440 * Math.pow(2, (deg(d, 4) - 69) / 12))).join(", ")}], inf), \\dec, 0.05, \\click, 0.1, \\pan, Pwhite(-0.7, 0.7), \\send, 0.5)`,
    toms: `~d.(\\d6, \\instrument, \\perc, \\dur, 1/4, \\amp, ~x.(["${ghosted(16, 5, 3)}", "${ghosted(16, 7, 1)}"], 0.3), \\freq, Pseq([${[0, 2, 4, 2].map((d) => Math.round(440 * Math.pow(2, (deg(d, 2) - 69) / 12))).join(", ")}], inf), \\dec, Pwhite(0.1, 0.22), \\pan, Pseq([-0.5, 0.5], inf), \\send, 0.3)`,
    pad: `~d.(\\d6, \\instrument, \\pad, \\dur, 8, \\midinote, Pseq([${chord(0, 3)}, ${chord(prog[1], 3)}], inf), \\sus, ${f((60 / bpm) * 6)}, \\att, 1.5, \\rel, 3, \\cutoff, Pwhite(1200, 3000), \\duck, 0.5, \\amp, 0.05)`,
  } as Record<string, string>)[st.lead];

  const about = `${st.name} · ${prog.map((d) => ["i", "ii", "III", "iv", "v", "VI", "VII"][d]).join("–")}`;
  return { seed, style: st.name, bpm, root, scale: scaleName, key: `${NOTE[root % 12]} ${scaleName}`, slots: { d1, d2, d3, d4, d5, d6 }, about };
}
