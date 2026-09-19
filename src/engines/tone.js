// Tone.js: a synthesis + scheduling framework. No pattern language: you build
// instruments as objects and schedule callbacks on a transport. More code per bar,
// but every knob of every synth is yours, and the effects are better than Strudel's.
import * as Tone from "tone";

const TRACKS = [
  {
    id: "reference",
    name: "Reference: Detroit 130",
    note: "Same brief, fully synthesised: membrane kick, noise hats/clap, filtered saw bass, poly stabs into FeedbackDelay + convolution-style Reverb.",
    code: `// In scope: Tone, out (master bus), use(node) registers a node for cleanup.
const T = Tone.getTransport();
T.bpm.value = 130;

const verb  = use(new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 })).connect(out);
const delay = use(new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.45, wet: 1 })).connect(out);
delay.connect(verb);

// drums
const kick = use(new Tone.MembraneSynth({
  pitchDecay: 0.035, octaves: 7,
  envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.05 },
})).connect(out);
kick.volume.value = -4;

const hatHP = use(new Tone.Filter(8500, "highpass")).connect(out);
const hat = use(new Tone.NoiseSynth({
  noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
})).connect(hatHP);
hat.volume.value = -12;

const ohHP = use(new Tone.Filter(7000, "highpass")).connect(out);
const openHat = use(new Tone.NoiseSynth({
  noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
})).connect(ohHP);
openHat.volume.value = -17;

const clapBP = use(new Tone.Filter({ frequency: 1400, type: "bandpass", Q: 1.2 })).connect(out);
clapBP.connect(verb);
const clap = use(new Tone.NoiseSynth({
  noise: { type: "pink" }, envelope: { attack: 0.002, decay: 0.17, sustain: 0 },
})).connect(clapBP);
clap.volume.value = -4;

// bass: saw -> resonant low-pass swept by an 8-bar LFO
const bassLP = use(new Tone.Filter({ frequency: 600, type: "lowpass", Q: 5, rolloff: -24 })).connect(out);
const sweep = use(new Tone.LFO({ frequency: "8m", min: 260, max: 1300 })).start();
sweep.connect(bassLP.frequency);
const bass = use(new Tone.Synth({
  oscillator: { type: "sawtooth" },
  envelope: { attack: 0.003, decay: 0.17, sustain: 0, release: 0.02 },
})).connect(bassLP);
bass.volume.value = -5;

// stabs: fat detuned saws, filtered, sent to the delay
const stabLP = use(new Tone.Filter({ frequency: 1800, type: "lowpass", Q: 3 })).connect(out);
stabLP.connect(delay);
const stabSweep = use(new Tone.LFO({ frequency: "4m", min: 900, max: 2600 })).start();
stabSweep.connect(stabLP.frequency);
const stabs = use(new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth", count: 3, spread: 22 },
  envelope: { attack: 0.004, decay: 0.16, sustain: 0, release: 0.08 },
})).connect(stabLP);
stabs.volume.value = -17;

const ACC = [0.35, 0.55, 1, 0.55];
const BASS = ["F1", "F1", null, "F1", "F1", null, null, "Ab1", "F1", "F1", "F1", null, null, "C2", "Eb2", null];
const CHORDS = [["F3", "Ab3", "C4", "Eb4", "G4"], ["Db3", "F3", "Ab3", "C4", "Eb4"]];

let step = 0;
use(new Tone.Loop((time) => {
  const s = step % 16, bar = Math.floor(step / 16);
  if (s % 4 === 0) kick.triggerAttackRelease("F1", "8n", time);
  if (s === 4 || s === 12) clap.triggerAttackRelease("16n", time);
  hat.triggerAttackRelease("32n", time, ACC[s % 4]);
  if (s % 4 === 2) openHat.triggerAttackRelease("16n", time);
  if (BASS[s]) bass.triggerAttackRelease(BASS[s], "16n", time);
  if (s === 4 || s === 14) stabs.triggerAttackRelease(CHORDS[Math.floor(bar / 2) % 2], "16n", time);
  step++;
}, "16n")).start(0);

T.start("+0.1");`,
  },
  {
    id: "fm",
    name: "FM bells + pad (what Tone adds)",
    note: "FMSynth bells, a slow AM pad through Chorus, long reverb. The kind of sound design Strudel's synths can't reach.",
    code: `const T = Tone.getTransport();
T.bpm.value = 96;

const verb = use(new Tone.Reverb({ decay: 7, preDelay: 0.03, wet: 0.55 })).connect(out);
const chorus = use(new Tone.Chorus({ frequency: 0.6, delayTime: 4, depth: 0.7, wet: 0.6 })).start().connect(verb);
const ping = use(new Tone.PingPongDelay({ delayTime: "8n.", feedback: 0.5, wet: 0.35 })).connect(verb);

const bells = use(new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 3.01, modulationIndex: 14,
  envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.2 },
  modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
})).connect(ping);
bells.volume.value = -16;

const pad = use(new Tone.PolySynth(Tone.AMSynth, {
  harmonicity: 1.5,
  oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
  envelope: { attack: 1.8, decay: 1, sustain: 0.8, release: 3 },
})).connect(chorus);
pad.volume.value = -20;

const sub = use(new Tone.Synth({
  oscillator: { type: "sine" }, envelope: { attack: 0.05, decay: 0.4, sustain: 0.7, release: 1.5 },
})).connect(out);
sub.volume.value = -8;

const PADS = [["F3", "A3", "C4", "E4", "G4"], ["D3", "F3", "A3", "C4", "E4"], ["Bb2", "D3", "F3", "A3", "C4"], ["C3", "E3", "G3", "Bb3", "D4"]];
const ROOTS = ["F1", "D1", "Bb0", "C1"];
const SCALE = ["F5", "G5", "A5", "C6", "D6", "F6", "A6"];

let bar = 0;
use(new Tone.Loop((time) => {
  pad.triggerAttackRelease(PADS[bar % 4], "1m", time);
  sub.triggerAttackRelease(ROOTS[bar % 4], "2n.", time);
  bar++;
}, "1m")).start(0);

// a seeded walk over the pentatonic, so it's the same melody every run
let seed = 7, pos = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
use(new Tone.Loop((time) => {
  if (rnd() < 0.62) {
    pos = Math.max(0, Math.min(SCALE.length - 1, pos + Math.round(rnd() * 4 - 2)));
    bells.triggerAttackRelease(SCALE[pos], "8n", time, 0.4 + rnd() * 0.6);
  }
}, "8n")).start(0);

T.start("+0.1");`,
  },
];

let out = null, analyser = null, owned = [];

export default {
  id: "tone",
  name: "Tone.js",
  lang: "JavaScript",
  blurb:
    "Instruments as objects, a sample-accurate transport, studio-grade effects. No mini-notation, so an LLM writes 5× more code per bar.",
  tracks: TRACKS,
  async play(code) {
    this.stop();
    await Tone.start();
    const raw = Tone.getContext().rawContext;
    out = new Tone.Gain(0.7);
    analyser = raw.createAnalyser();
    analyser.fftSize = 2048;
    const limiter = new Tone.Limiter(-1);
    out.chain(limiter, Tone.getDestination());
    limiter.connect(analyser);
    owned = [out, limiter];
    const use = (n) => (owned.push(n), n);
    new Function("Tone", "out", "use", code)(Tone, out, use);
  },
  stop() {
    const T = Tone.getTransport();
    T.stop();
    T.cancel(0);
    T.position = 0;
    owned.forEach((n) => { try { n.dispose(); } catch {} });
    owned = [];
    analyser = null;
  },
  analyser: () => analyser,
  context: () => Tone.getContext().rawContext,
};
