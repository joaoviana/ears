// Native engines can't run in a browser, so they're rendered to WAV on this machine
// (`npm run render`) and looped here. The pane shows the source that produced the file;
// editing it does nothing until you re-render.
import scSource from "../../offline/supercollider/render.scd?raw";

const TRACKS = [
  {
    id: "reference",
    name: "Reference: Detroit 130 (SuperCollider)",
    note: "Rendered offline by scsynth, faster than realtime, no GUI. MoogFF bass, a real multi-burst clap, comb echo into FreeVerb, compressor + limiter on the master. Read-only here: run `npm run render` after editing offline/supercollider/render.scd.",
    code: scSource,
    file: "/renders/detroit-supercollider.wav",
  },
];

let ctx = null, analyser = null, src = null;
const cache = {};

export default {
  id: "rendered",
  name: "SuperCollider",
  lang: "sclang → scsynth, rendered to WAV",
  blurb:
    "The native ceiling, heard in the browser by rendering to a file. This is also what TidalCycles and Sonic Pi sound like underneath: both are front-ends that drive SuperCollider.",
  tracks: TRACKS,
  async play(_code, track) {
    if (!ctx) {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(ctx.destination);
    }
    if (!cache[track.file]) {
      const res = await fetch(track.file);
      if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) throw new Error("No render found. Run `npm run render` first.");
      cache[track.file] = await ctx.decodeAudioData(await res.arrayBuffer());
    }
    this.stop();
    src = ctx.createBufferSource();
    src.buffer = cache[track.file];
    src.loop = true;
    src.connect(analyser);
    await ctx.resume();
    src.start();
  },
  stop() {
    if (src) { try { src.stop(); src.disconnect(); } catch {} src = null; }
  },
  analyser: () => analyser,
  context: () => ctx,
};
