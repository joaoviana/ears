// The brief in raw SuperCollider: SynthDefs for each voice, Pbind patterns on a TempoClock.
// This is the ceiling: any of these SynthDefs can grow into whatever you can imagine.
(
s.waitForBoot {
  SynthDef(\kick, { |out = 0, amp = 0.9|
    var env = EnvGen.kr(Env.perc(0.001, 0.36), doneAction: 2);
    var sig = SinOsc.ar(44 + (190 * EnvGen.kr(Env.perc(0.001, 0.045))));
    Out.ar(out, (sig * env * 1.6).tanh * amp ! 2);
  }).add;
  SynthDef(\hat, { |out = 0, amp = 0.2, dec = 0.03, hp = 8500|
    var sig = HPF.ar(WhiteNoise.ar, hp) * EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    Out.ar(out, sig * amp ! 2);
  }).add;
  SynthDef(\clap, { |out = 0, amp = 0.5, send = 0.5, fx|
    var sig = BPF.ar(PinkNoise.ar(6), 1400, 0.6) * EnvGen.kr(Env.perc(0.002, 0.17), doneAction: 2);
    Out.ar(out, sig * amp ! 2); Out.ar(fx, sig * send ! 2);
  }).add;
  SynthDef(\bass, { |out = 0, freq = 43, amp = 0.8, cutoff = 600|
    var sig = MoogFF.ar(Saw.ar(freq), cutoff, 2.6) * EnvGen.kr(Env.perc(0.003, 0.17), doneAction: 2);
    Out.ar(out, sig * amp ! 2);
  }).add;
  SynthDef(\stab, { |out = 0, freq = 440, amp = 0.1, cutoff = 1800, fx|
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.996, 1, 1.004])), cutoff, 0.35)
      * EnvGen.kr(Env.perc(0.004, 0.16), doneAction: 2);
    Out.ar(out, sig * amp); Out.ar(fx, sig * amp);
  }).add;
  SynthDef(\space, { |in, out = 0|
    var dry = In.ar(in, 2);
    var echo = CombL.ar(dry, 1, 60 / 130 * 0.75, 2.2);
    Out.ar(out, JPverb.ar(dry + echo, 2.8, 0.2, 2.5) * 0.35 + (echo * 0.4));   // needs sc3-plugins; swap for FreeVerb2 without
  }).add;
  s.sync;

  ~fx = Bus.audio(s, 2);
  Synth.tail(s, \space, [\in, ~fx]);
  ~clock = TempoClock(130 / 60);

  Pdef(\drums, Ppar([
    Pbind(\instrument, \kick, \dur, 1),
    Pbind(\instrument, \clap, \dur, 1, \fx, ~fx, \amp, Pseq([0, 0.5], inf)),
    Pbind(\instrument, \hat, \dur, 1/4, \amp, Pseq([0.08, 0.12, 0.22, 0.12], inf)),
    Pbind(\instrument, \hat, \dur, 1/2, \dec, 0.16, \hp, 7000, \amp, Pseq([0, 0.12], inf)),
  ])).play(~clock, quant: 4);

  Pdef(\bass, Pbind(\instrument, \bass, \dur, 1/4,
    \midinote, Pseq([29, 29, \r, 29, 29, \r, \r, 32, 29, 29, 29, \r, \r, 36, 39, \r], inf),
    \cutoff, Pseg(Pseq([260, 1300, 260], inf), 16, \exp),
  )).play(~clock, quant: 4);

  Pdef(\stabs, Pbind(\instrument, \stab, \fx, ~fx,
    \dur, Pseq([1, 2.5, 0.5], inf), \amp, Pseq([0, 0.1, 0.1], inf),
    \midinote, Pstutter(6, Pseq([[53, 56, 60, 63, 67], [49, 53, 56, 60, 63]], inf)),
    \cutoff, Pseg(Pseq([900, 2600, 900], inf), 8),
  )).play(~clock, quant: 4);
};
)
