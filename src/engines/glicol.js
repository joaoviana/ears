// Glicol: a graph-oriented live-coding language, Rust compiled to WASM, running
// entirely in an AudioWorklet. Tiny, text-only, sample-accurate. Every line is
// `name: node >> node >> node`, which is about the easiest thing an LLM can write.
import Glicol from "glicol";

const TRACKS = [
  {
    id: "reference",
    name: "Reference: Detroit 130",
    note: "Same brief in Glicol's built-in synth voices (bd / sn / hh / sawsynth) and its plate reverb. No samples, no feedback delay.",
    bpm: 130,
    code: `// each line is a signal chain; ~names are buses; out: is the speakers
~kick: speed 4.0 >> seq 60 >> bd 0.25 >> mul 0.9

~clap: seq _ 60 _ 60 >> sn 0.12 >> mul 0.35

~hat: speed 16.0 >> seq 60 >> hh 0.02 >> mul ~acc
~acc: speed 4.0 >> seq 60 _ 60 _ >> envperc 0.001 0.2 >> mul 0.2 >> add 0.08

~ohat: speed 4.0 >> seq _ 60 >> hh 0.12 >> mul 0.12

~bass: seq 29 29 _29 32 29 29 _36 39 >> sawsynth 0.003 0.17 >> lpf ~sweep 4.0 >> mul 0.5
~sweep: sin 0.034 >> mul 520 >> add 780

~s1: seq _ 53 _ _53 >> sawsynth 0.004 0.15
~s2: seq _ 56 _ _56 >> sawsynth 0.004 0.15
~s3: seq _ 60 _ _60 >> sawsynth 0.004 0.15
~s4: seq _ 63 _ _63 >> sawsynth 0.004 0.15
~s5: seq _ 67 _ _67 >> sawsynth 0.004 0.15
~stab: mix ~s1 ~s2 ~s3 ~s4 ~s5 >> lpf ~cut 2.0 >> mul 0.09
~cut: sin 0.07 >> mul 800 >> add 1700
~echo: ~stab >> delayms 346 >> mul 0.5
~echo2: ~stab >> delayms 692 >> mul 0.25
~wet: mix ~stab ~echo ~echo2 ~clap >> plate 0.5

out: mix ~kick ~hat ~ohat ~bass ~wet >> mul 0.62`,
  },
];

let glicol = null, analyser = null, ctx = null;

export default {
  id: "glicol",
  name: "Glicol",
  lang: "Glicol (Rust → WASM)",
  blurb:
    "The whole engine is one AudioWorklet. Graph syntax an LLM can't really get wrong, but a small node library and one maintainer.",
  tracks: TRACKS,
  async play(code, track) {
    if (!glicol) {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(ctx.destination);
      glicol = new Glicol({ audioContext: ctx, connectTo: analyser });
      // the engine loads its wasm asynchronously and has no ready promise
      await new Promise((r) => setTimeout(r, 1500));
    }
    glicol.setBPM(track?.bpm ?? 120);
    glicol.run(code);
  },
  stop() {
    if (glicol) { glicol.stop(); ctx.suspend(); }
  },
  analyser: () => analyser,
  context: () => ctx,
};
