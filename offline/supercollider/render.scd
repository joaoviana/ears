// Non-realtime render of the brief: builds an OSC score from the patterns and hands it to scsynth,
// which writes a WAV faster than realtime with no audio device and no GUI.
//   sclang offline/supercollider/render.scd <out.wav> <seconds>
(
var out = thisProcess.argv[0] ? "detroit-sc.wav", dur = (thisProcess.argv[1] ? "60").asFloat;
var beat = 60 / 130, fx = 16;
var defs = [
  SynthDef(\kick, { |out = 0, amp = 0.9|
    var env = EnvGen.kr(Env.perc(0.001, 0.36), doneAction: 2);
    var sig = SinOsc.ar(44 + (190 * EnvGen.kr(Env.perc(0.001, 0.045))));
    Out.ar(out, (sig * env * 1.6).tanh * amp ! 2);
  }),
  SynthDef(\hat, { |out = 0, amp = 0.2, dec = 0.03, hp = 8500, pan = 0|
    var sig = HPF.ar(WhiteNoise.ar, hp) * EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    Out.ar(out, Pan2.ar(sig, pan, amp));
  }),
  SynthDef(\clap, { |out = 0, amp = 0.5, send = 0.5, fx = 16|
    var env = EnvGen.kr(Env.perc(0.002, 0.17), doneAction: 2);
    // three quick bursts then the body: what makes a clap a clap
    var bursts = Mix.fill(3, { |i| EnvGen.kr(Env.perc(0.001, 0.012), DelayN.kr(Impulse.kr(0), 0.05, i * 0.011)) });
    var sig = BPF.ar(PinkNoise.ar(7), 1400, 0.6) * (env + bursts);
    Out.ar(out, sig * amp ! 2); Out.ar(fx, sig * send ! 2);
  }),
  SynthDef(\bass, { |out = 0, freq = 43, amp = 0.8, cutoff = 600|
    var sig = MoogFF.ar(Saw.ar(freq) + (Pulse.ar(freq * 0.5, 0.4) * 0.4), cutoff, 2.7)
      * EnvGen.kr(Env.perc(0.003, 0.17), doneAction: 2);
    Out.ar(out, (sig * 1.4).tanh * amp ! 2);
  }),
  SynthDef(\stab, { |out = 0, freq = 440, amp = 0.1, cutoff = 1800, fx = 16|
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.994, 1, 1.006])), cutoff, 0.35)
      * EnvGen.kr(Env.perc(0.004, 0.16), doneAction: 2);
    Out.ar(out, sig * amp); Out.ar(fx, sig * amp);
  }),
  SynthDef(\space, { |in = 16, out = 0|
    var dry = In.ar(in, 2);
    var echo = CombL.ar(dry, 1, 60 / 130 * 0.75, 2.4);
    var wet = FreeVerb2.ar(dry[0] + echo[0], dry[1] + echo[1], 1, 0.86, 0.35);
    Out.ar(out, (wet * 0.4) + (echo * 0.45));
  }),
  // master bus: gentle glue compression, then a brickwall limiter
  SynthDef(\master, {
    var sig = In.ar(0, 2) * 2.6;
    sig = Compander.ar(sig, sig, 0.35, 1, 0.5, 0.005, 0.12);
    ReplaceOut.ar(0, Limiter.ar(sig, 0.95, 0.004));
  }),
];
var pattern = Ppar([
  Pbind(\instrument, \kick, \dur, 1, \stretch, beat),
  Pbind(\instrument, \clap, \dur, 1, \stretch, beat, \fx, fx, \amp, Pseq([Rest(0), 0.5], inf)),
  Pbind(\instrument, \hat, \dur, 1/4, \stretch, beat, \amp, Pseq([0.1, 0.15, 0.28, 0.15], inf), \pan, Pseq([-0.2, 0.2], inf)),
  Pbind(\instrument, \hat, \dur, 1/2, \stretch, beat, \dec, 0.16, \hp, 7000, \amp, Pseq([Rest(0), 0.12], inf)),
  Pbind(\instrument, \bass, \dur, 1/4, \stretch, beat,
    \midinote, Pseq([29, 29, \r, 29, 29, \r, \r, 32, 29, 29, 29, \r, \r, 36, 39, \r], inf),
    \cutoff, Pseg(Pseq([260, 1300, 260], inf), 16 * beat, \exp)),
  Pbind(\instrument, \stab, \fx, fx, \stretch, beat,
    \dur, Pseq([1, 2.5, 0.5], inf), \amp, Pseq([Rest(0), 0.16, 0.16], inf),
    \midinote, Pstutter(6, Pseq([[53, 56, 60, 63, 67], [49, 53, 56, 60, 63]], inf)),
    \cutoff, Pseg(Pseq([900, 2600, 900], inf), 8 * beat)),
]);
var score = pattern.asScore(dur, 0.01);
defs.do { |d| score.add([0.0, [\d_recv, d.asBytes]]) };
score.add([0.005, [\s_new, \space, 1900, 1, 0, \in, fx]]);
score.add([0.006, [\s_new, \master, 1901, 1, 0]]);
score.add([dur + 0.1, [\c_set, 0, 0]]);
score.sort;
score.recordNRT(
  PathName.tmp +/+ "soundcheck.osc", out, nil, 48000, "WAV", "int16",
  ServerOptions.new.numOutputBusChannels_(2).memSize_(2 ** 17),
  "", dur, { "RENDER DONE".postln; 0.exit });
)
