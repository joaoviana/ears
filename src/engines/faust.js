// Faust: a functional DSP language. The compiler itself runs in the browser (WASM),
// so edited code is recompiled to a new AudioWorklet in about a second.
import { instantiateFaustModuleFromFile, LibFaust, FaustCompiler, FaustMonoDspGenerator } from "@grame/faustwasm/dist/esm/index.js";
import detroit from "../faust/detroit.dsp?raw";
import physical from "../faust/physical.dsp?raw";

const TRACKS = [
  {
    id: "reference",
    name: "Reference: Detroit 130",
    note: "Same brief. Moog ladder filter model on the bass, zita reverb (the one in every Linux studio). The sequencer is DSP too.",
    code: detroit,
  },
  {
    id: "physical",
    name: "Physical models (what Faust adds)",
    note: "Simulated djembe, marimba and nylon string. No samples, no oscillators: resonating bodies you can re-tune per hit.",
    code: physical,
  },
];

let compiler = null, ctx = null, analyser = null, node = null;

async function getCompiler() {
  if (!compiler) {
    const mod = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
    compiler = new FaustCompiler(new LibFaust(mod));
  }
  return compiler;
}

export default {
  id: "faust",
  name: "Faust",
  lang: "Faust (→ WASM AudioWorklet)",
  blurb:
    "The sound-design ceiling in a browser: physical models, analog filter models, proper reverbs. Sequencing in it is awkward; best as the instrument rack behind another clock.",
  tracks: TRACKS,
  async play(code) {
    const c = await getCompiler();
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "playback" });
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(ctx.destination);
    }
    const gen = new FaustMonoDspGenerator();
    const ok = await gen.compile(c, "track" + Date.now(), code, "-I libraries/");
    if (!ok) throw new Error(c.getErrorMessage?.() || "Faust compile failed");
    const next = await gen.createNode(ctx);
    this.stop();
    node = next;
    node.connect(analyser);
    await ctx.resume();
  },
  stop() {
    if (node) { try { node.disconnect(); node.destroy?.(); } catch {} node = null; }
  },
  analyser: () => analyser,
  context: () => ctx,
};
