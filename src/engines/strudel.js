// Strudel: pattern language, WebAudio ("superdough") underneath.
// Unlike the hosted sandbox, this runs locally so the real sample banks stream:
// every classic drum machine, Dirt-Samples, piano, VCSL.
import { initStrudel, evaluate, hush, samples, getAudioContext, getAnalyserById } from "@strudel/web";

const DS = "https://raw.githubusercontent.com/felixroos/dough-samples/main";

const TRACKS = [
  {
    id: "reference",
    name: "Reference: Detroit 130",
    note: "The shared brief. Real TR-909 samples, saw bass with a moving filter, minor 9th stabs into delay + reverb.",
    code: `// THE BRIEF (every engine plays this): 130 BPM, F minor.
// 4-floor kick, clap on 2+4, 16th hats with accents, offbeat open hat,
// one-bar saw bass with a slow filter sweep, minor-9th stabs into a dotted-8th delay.
setcpm(130/4)
stack(
  s("bd*4").bank("RolandTR909").gain(1),
  s("bd*4").bank("RolandTR909").speed(.6).lpf(160).gain(.5),
  s("~ cp ~ cp").bank("RolandTR909").room(.3).size(3).gain(.55),
  s("hh*16").bank("RolandTR909").gain("[.18 .3 .55 .3]*4").pan(sine.range(.4,.6).fast(2)),
  s("[~ oh]*4").bank("RolandTR909").gain(.35).cut(1),

  note("f1 f1 [~ f1] ab1 f1 f1 [~ c2] eb2").s("sawtooth")
    .lpf(sine.range(260, 1300).slow(8)).lpq(7)
    .decay(.17).sustain(0).gain(.75),

  note("<[f3,ab3,c4,eb4,g4] [db3,f3,ab3,c4,eb4]>/2").s("sawtooth")
    .struct("~ x ~ [~ x]").decay(.14).sustain(0)
    .lpf(perlin.range(900, 2600).slow(4)).lpq(4)
    .delay(.5).delaytime(.346).delayfeedback(.45)
    .room(.5).size(5).gain(.3).pan(.42)
).postgain(0.55).analyze("mix")`,
  },
  {
    id: "disco",
    name: "Filtered disco 122",
    note: "Linn/909 kit, octave bass, chord() voicings, pumped pad. What a 'guest' with chords sounds like.",
    code: `setcpm(122/4)
stack(
  s("bd*4").bank("RolandTR909").gain(1),
  s("~ cp ~ cp").bank("LinnDrum").room(.25).gain(.6),
  s("[~ hh]*4").bank("RolandTR909").gain(.5).cut(1),
  s("hh*16").bank("LinnDrum").gain("[.1 .22]*8").speed(1.2),
  s("~ ~ ~ [~ oh]").bank("RolandTR909").gain(.3).cut(1),

  note("<f1 d1 bb0 c1>".add("[0 12]*4")).s("sawtooth")
    .lpf(sine.range(300, 1800).slow(16)).lpq(5)
    .decay(.14).sustain(.2).gain(.7),

  // pumped pad: the gain saw is a fake sidechain, one duck per beat
  chord("<Fm9 Dm7b5 Bb^7 C7>").voicing().s("sawtooth")
    .lpf(sine.range(500, 3200).slow(16))
    .gain(saw.fast(4).range(.06, .26)).room(.5).size(4),

  chord("<Fm9 Dm7b5 Bb^7 C7>").voicing().s("square")
    .struct("[~ x] ~ [~ x] [x ~ ~ x]").decay(.09).sustain(0)
    .lpf(2400).gain(.16).pan(.62),

  n("<[0 2 4 7] [4 2 0 ~] [0 4 7 9] [7 4 2 ~]>*2").scale("F5:minor:pentatonic")
    .s("triangle").decay(.12).sustain(0)
    .delay(.35).delaytime(.246).delayfeedback(.4).room(.4).gain(.2)
).postgain(0.6).analyze("mix")`,
  },
  {
    id: "dub",
    name: "Dub techno 124",
    note: "Space is the instrument: one chord, long feedback delay, big room. Tests Strudel's effects more than its synths.",
    code: `setcpm(124/4)
stack(
  s("bd*4").bank("RolandTR808").gain(.95).lpf(900),
  s("hh*8").bank("RolandTR808").gain("[.1 .3]*4").hpf(6000).pan(sine.range(.3,.7).slow(3)),
  s("~ ~ ~ rim").bank("RolandTR808").room(.7).size(8).gain(.3),

  // the chord: short, filtered, and then the delay does the playing
  note("[~ [d3,f3,a3,c4]] ~ [~ [d3,f3,a3,c4]] [~ ~ [c3,e3,g3,b3] ~]").s("sawtooth")
    .decay(.11).sustain(0)
    .lpf(perlin.range(500, 2200).slow(8)).lpq(6)
    .delay(.7).delaytime(.363).delayfeedback(.68)
    .room(.85).size(9).gain(.32),

  note("d1 ~ ~ d1 ~ ~ [d1 f1] ~").s("sine").decay(.45).sustain(0).gain(.85),

  s("white").struct("x").slow(4).attack(1.5).release(1.5).hpf(sine.range(2000, 9000).slow(8))
    .gain(.04).room(.9)
).postgain(1.0).analyze("mix")`,
  },
  {
    id: "garage",
    name: "UK garage 132",
    note: "Swung 2-step, pitched vocal-style chops from a sample, sub bass. Shows sample manipulation (chop / speed / begin).",
    code: `setcpm(132/4)
stack(
  s("bd ~ ~ [~ bd] ~ ~ bd ~").bank("RolandTR909").gain(1),
  s("~ sd ~ sd").bank("RolandTR909").gain(.6).room(.2),
  s("hh*8").bank("RolandTR909").gain("[.45 .2 .35 .25]*2").swingBy(1/6, 4),
  s("~ ~ [~ oh] ~").bank("RolandTR909").gain(.3).cut(1),
  s("~ [~ rim] ~ [rim ~]").bank("RolandTR909").gain(.25).pan(.7),

  note("<f1 f1 db1 eb1>").s("sine").struct("x ~ [~ x] ~ ~ x ~ [x ~]")
    .decay(.3).sustain(.3).gain(.9),

  // organ-ish stabs, the garage signature
  chord("<Fm9 Fm9 Db^7 Eb7>").voicing().s("triangle")
    .struct("~ [~ x] ~ x ~ [x ~] ~ ~").decay(.12).sustain(0)
    .lpf(3000).room(.35).gain(.35),

  // chopped piano as the 'vocal': slices re-ordered every bar
  s("piano").note("<f4 ab4 c5 eb5>").struct("~ x [~ x] ~ x ~ [x x] ~")
    .begin("<0 .05 .02 .08>").clip(.35).speed("<1 1 2 1>")
    .delay(.3).delaytime(.17).delayfeedback(.35).room(.4).gain(.3).pan(.35)
).postgain(0.58).analyze("mix")`,
  },
  {
    id: "chillhop",
    name: "Chillhop 84",
    note: "sundial's home turf: sampled piano, dusty kit, swing. The softest thing Strudel does well.",
    code: `setcpm(84/4)
stack(
  s("bd ~ [~ bd] ~ bd ~ ~ ~").bank("AkaiMPC60").gain(.9).lpf(2500),
  s("~ sd ~ sd").bank("AkaiMPC60").gain(.5).lpf(4000).room(.3),
  s("hh*8").bank("AkaiMPC60").gain("[.3 .12 .22 .12]*2").swingBy(1/5, 4).lpf(7000),

  note("<f2 d2 bb1 c2>").s("triangle").struct("x ~ ~ [~ x] x ~ ~ ~")
    .decay(.4).sustain(.3).lpf(600).gain(.8),

  chord("<F^9 Dm9 Bb^9 C9>").voicing().s("piano")
    .struct("x ~ ~ [~ x] ~ x ~ ~").clip(1.5)
    .lpf(3500).room(.45).size(4).gain(.45),

  n("<[0 ~ 2 4] [7 4 ~ 2] [4 ~ 7 9] [7 ~ 4 ~]>").scale("F4:major:pentatonic")
    .s("piano").clip(2).delay(.3).delaytime(.357).delayfeedback(.3)
    .room(.5).gain(.35).pan(.6),

  s("crackle*4").density(.08).gain(.12)
).postgain(0.85).analyze("mix")`,
  },
];

let ready = null;
function init() {
  if (!ready) {
    ready = initStrudel({
      prebake: () =>
        Promise.all([
          samples(`${DS}/tidal-drum-machines.json`),
          samples(`${DS}/piano.json`),
          samples(`${DS}/Dirt-Samples.json`),
          samples(`${DS}/vcsl.json`),
        ]),
    });
  }
  return ready;
}

export default {
  id: "strudel",
  name: "Strudel",
  lang: "JavaScript + mini-notation",
  blurb:
    "Patterns first. Real drum-machine samples stream from GitHub, synths and effects are WebAudio. One line changes a whole kit.",
  tracks: TRACKS,
  async play(code) {
    await init();
    await evaluate(code);
  },
  stop() {
    try { hush(); } catch {}
  },
  analyser() {
    try { return getAnalyserById("mix", 2048, 0.6); } catch { return null; }
  },
  context() {
    try { return getAudioContext(); } catch { return null; }
  },
};
