// The sound engine for the TUI set. Runs headless under sclang:
//   - boots scsynth (no inputs, so no microphone prompt)
//   - listens on OSC /eval for slot code and interprets it; Pdefs swap on the next 4-beat boundary
//   - an "ears" synth on the master bus streams measurements to the TUI
//   - every scheduled hit is announced to the TUI ahead of time with its logical timestamp and beat, so visuals
//     land on it exactly, however late the message itself arrives
(
var tui = NetAddr("127.0.0.1", ("EARS_PORT".getenv ? "57200").asInteger);
var mute = "SOUNDCHECK_MUTE".getenv.notNil;
var momentsPath = thisProcess.nowExecutingPath.dirname +/+ "moments.scd";
// a second engine (tests, a second deck) needs its own server port
if("EARS_SC_PORT".getenv.notNil) { Server.default = s = Server(\ears2, NetAddr("127.0.0.1", "EARS_SC_PORT".getenv.asInteger)) };
s.options.numInputBusChannels = 0;
s.options.memSize = 2 ** 17;
s.latency = 0.2;

s.waitForBoot {
  // Nothing that isn't sound gets into a feedback loop or the limiter: NaN/inf become silence, and anything beyond
  // +-4 (music here never exceeds ~2 before the limiter) is clipped. Without this, a burst of garbage at server
  // start circulated in the echo and reverb for ~15 s and kept the limiter pinned, ducking the whole mix.
  ~safe = { |sig| Sanitize.ar(sig).clip2(4) };
  // Character, as ordinary numbers a patch can set: crush 0..1 is sample-and-bit reduction, fold 0..1 a wavefolder.
  // Core UGens only, bounded at both ends. The point is that a DJ can reach for dirt without reaching for a Quark or
  // a SynthDef: the host owns the DSP, the agent only ever names it.
  ~col = { |sig, crush = 0, fold = 0|
    var c = crush.clip(0, 1), f = fold.clip(0, 1);
    var step = 0.5 ** (15 - (c * 11));
    var down = Latch.ar(sig, Impulse.ar((SampleRate.ir * (1 - (c * 0.92))).max(1800)));
    var crushed = SelectX.ar(c, [sig, (down / step).round(1) * step]);
    SelectX.ar(f, [crushed, (crushed * (1 + (f * 5))).fold2(0.8)]);
  };
  ~fx = Bus.audio(s, 2);
  ~duck = Bus.control(s, 1);   // the kick's envelope, for sidechain pumping (\duck 0..1 on bass, acid, stab, pad)
  ~clock = TempoClock(130 / 60);

  SynthDef(\kick, { |out = 0, amp = 0.9, tune = 44, dec = 0.36, drive = 1.6, punch = 190|
    var env = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var sig = SinOsc.ar(tune + (punch * EnvGen.kr(Env.perc(0.001, 0.045))));
    Out.kr(~duck, EnvGen.kr(Env.perc(0.002, 0.22)) * amp.min(1));
    Out.ar(out, (sig * env * drive).tanh * amp ! 2);
  }).add;
  // 303-ish: the filter envelope is the instrument. res 0..1, env = how far the filter opens per note
  SynthDef(\acid, { |out = 0, freq = 55, amp = 0.5, cutoff = 500, res = 0.8, env = 2500, dec = 0.18, wave = 0, send = 0.1|
    var osc = SelectX.ar(wave.clip(0, 1), [Saw.ar(freq), Pulse.ar(freq, 0.45)]);
    var fenv = EnvGen.kr(Env.perc(0.002, dec * 0.9));
    var sig = RLPF.ar(osc, (cutoff + (env * fenv)).clip(60, 12000).min(SampleRate.ir * 0.42), (1.02 - res.clip(0, 1)).clip(0.04, 1));
    sig = (sig * 1.8).tanh * EnvGen.kr(Env.perc(0.003, dec), doneAction: 2);
    Out.ar(out, sig * amp ! 2); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // FM pluck / bell: ratio sets the timbre (1 = warm, 3.5 = bell, 7.1 = metal), index the bite
  SynthDef(\fm, { |out = 0, freq = 440, amp = 0.2, ratio = 2, index = 3, dec = 0.4, pan = 0, send = 0.5, crush = 0, fold = 0|
    var e = EnvGen.kr(Env.perc(0.002, dec), doneAction: 2);
    var sig = ~col.(SinOsc.ar(freq + (SinOsc.ar(freq * ratio) * freq * index * EnvGen.kr(Env.perc(0.001, dec * 0.5)))), crush, fold) * e;
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // pad: slow, wide, filtered. sus is the hold time in seconds
  SynthDef(\pad, { |out = 0, freq = 220, amp = 0.12, cutoff = 1200, att = 0.8, sus = 2, rel = 2, send = 0.6, duck = 0.7|
    var e = EnvGen.kr(Env.linen(att, sus, rel, 1, \sine), doneAction: 2) * (1 - (In.kr(~duck) * duck).clip(0, 1));
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.992, 0.998, 1.003, 1.009])), (cutoff * LFTri.kr(0.11).range(0.7, 1.3)).min(SampleRate.ir * 0.42), 0.5) * e;
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  // tuned percussion: tom / conga / blip depending on freq and dec
  SynthDef(\perc, { |out = 0, freq = 180, amp = 0.3, dec = 0.14, pan = 0, send = 0.3, click = 0.3|
    var e = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var sig = (SinOsc.ar(freq * (1 + (0.8 * EnvGen.kr(Env.perc(0.001, 0.02))))) + (HPF.ar(WhiteNoise.ar, 3000) * click * EnvGen.kr(Env.perc(0.001, 0.01)))) * e;
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  SynthDef(\hat, { |out = 0, amp = 0.2, dec = 0.03, hp = 8500, pan = 0|
    var sig = HPF.ar(WhiteNoise.ar, hp.min(SampleRate.ir * 0.42)) * EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    Out.ar(out, Pan2.ar(sig, pan, amp));
  }).add;
  SynthDef(\clap, { |out = 0, amp = 0.5, send = 0.5|
    var env = EnvGen.kr(Env.perc(0.002, 0.17), doneAction: 2);
    var bursts = Mix.fill(3, { |i| EnvGen.kr(Env.perc(0.001, 0.012), DelayN.kr(Impulse.kr(0), 0.05, i * 0.011)) });
    var sig = BPF.ar(PinkNoise.ar(7), 1400, 0.6) * (env + bursts);
    Out.ar(out, sig * amp ! 2); Out.ar(~fx, sig * send ! 2);
  }).add;
  SynthDef(\bass, { |out = 0, freq = 43, amp = 0.8, cutoff = 600, res = 2.7, dec = 0.17, duck = 0.4, crush = 0, fold = 0|
    var sig = MoogFF.ar(Saw.ar(freq) + (Pulse.ar(freq * 0.5, 0.4) * 0.4), cutoff.min(SampleRate.ir * 0.42), res)
      * EnvGen.kr(Env.perc(0.003, dec), doneAction: 2);
    sig = ~col.(sig, crush, fold);
    Out.ar(out, (sig * 1.4).tanh * amp * (1 - (In.kr(~duck) * duck).clip(0, 1)) ! 2);
  }).add;
  // ---- new colours. Added because eleven voices of 5-7 numeric args each is a box with no interesting corners:
  // every idea an agent could have was "change a number on a filter". These are new sounds, not new powers.
  // 909-ish snare: a tuned body under a band of noise. snap is how much of it is noise
  SynthDef(\snare, { |out = 0, freq = 190, amp = 0.35, dec = 0.16, snap = 0.6, pan = 0, send = 0.2|
    var e = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var body = (SinOsc.ar(freq) + SinOsc.ar(freq * 1.58)) * 0.5 * EnvGen.kr(Env.perc(0.001, dec * 0.4));
    var sig = (body + (BPF.ar(WhiteNoise.ar, 3200, 0.9) * snap.clip(0, 1))) * e;
    Out.ar(out, Pan2.ar(sig.tanh, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // rim / click: a very short resonant tick, for offbeats and ghost notes
  SynthDef(\rim, { |out = 0, freq = 1700, amp = 0.25, dec = 0.035, pan = 0|
    var e = EnvGen.kr(Env.perc(0.0005, dec), doneAction: 2);
    var sig = ((Ringz.ar(Impulse.ar(0), freq.clip(200, 6000), dec * 0.8) * 0.3) + (HPF.ar(WhiteNoise.ar, 1200) * 0.4)) * e;
    Out.ar(out, Pan2.ar(sig.tanh, pan, amp));
  }).add;
  // pure sub. drop > 0 bends the pitch down into the note; long dec is the drop itself
  SynthDef(\sub, { |out = 0, freq = 41, amp = 0.6, dec = 0.5, drop = 0, duck = 0.5|
    var f = freq * (1 + (drop.clip(0, 4) * EnvGen.kr(Env.perc(0.001, dec * 0.5))));
    var sig = SinOsc.ar(f.clip(20, 400)) * EnvGen.kr(Env.perc(0.004, dec), doneAction: 2);
    Out.ar(out, (sig * amp * (1 - (In.kr(~duck) * duck).clip(0, 1))).tanh ! 2);
  }).add;
  // reese: two detuned saws beating against each other under a moving filter
  SynthDef(\reese, { |out = 0, freq = 55, amp = 0.35, detune = 0.6, cutoff = 700, res = 2.2, dec = 0.7, rate = 0.3, duck = 0.4, crush = 0, fold = 0|
    var e = EnvGen.kr(Env.linen(0.01, dec, 0.12, 1, \sine), doneAction: 2);
    var osc = Mix.ar(Saw.ar(freq * [1, 1 + (detune.clip(0, 3) * 0.01)])) * 0.5;
    var sig = MoogFF.ar(osc, (cutoff * LFTri.kr(rate.clip(0.01, 8)).range(0.6, 1.5)).clip(60, 6000).min(SampleRate.ir * 0.42), res.clip(0, 3.5));
    sig = ~col.(sig, crush, fold) * e;
    Out.ar(out, (sig * amp * (1 - (In.kr(~duck) * duck).clip(0, 1))).tanh ! 2);
  }).add;
  // Seven detuned saws under a filter envelope: the supersaw. Both references are built on it — an octave bass and
  // an arp that opens up. cutoff is where the filter starts, env how far it travels, att/rel how it gets there.
  SynthDef(\supersaw, { |out = 0, freq = 110, amp = 0.25, detune = 0.18, cutoff = 400, env = 2200, res = 0.3,
                        att = 0.01, sus = 0.3, rel = 0.25, spread = 0.8, send = 0.5, duck = 0.3, crush = 0, fold = 0,
                        bend = 0, bendt = 0.08, drive = 1, ring = 0, ringf = 320|
    var d = detune.clip(0, 1) * 0.02;
    // bend is how many semitones the pitch slides FROM into the note, over bendt seconds - negative swoops up into
    // it, positive falls in. Each event is its own synth, so this bends within a note, not between notes.
    var f = freq * EnvGen.kr(Env([bend.midiratio, 1], [bendt.max(0.001)], \exp));
    var osc = Splay.ar(Saw.ar(f * [1 - d, 1 - (d * 0.62), 1 - (d * 0.24), 1, 1 + (d * 0.24), 1 + (d * 0.62), 1 + d]), spread.clip(0, 1));
    var fenv = EnvGen.kr(Env.perc(att.max(0.001), (sus + rel).max(0.05)));
    var e = EnvGen.kr(Env.linen(att.max(0.001), sus, rel, 1, \sine), doneAction: 2);
    var sig = RLPF.ar(osc, (cutoff + (env * fenv)).clip(60, 14000).min(SampleRate.ir * 0.42), (1.02 - res.clip(0, 1)).clip(0.05, 1));
    sig = SelectX.ar(ring.clip(0, 1), [sig, sig * SinOsc.ar(ringf.clip(20, 8000))]);
    sig = (sig * drive.clip(1, 20)).tanh / drive.clip(1, 20).sqrt;
    sig = ~col.(sig, crush, fold) * e * (1 - (In.kr(~duck) * duck).clip(0, 1));
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  // plucked string / marimba, from a noise burst in a delay line. tone 0..1 is how bright the pluck is
  SynthDef(\pluck, { |out = 0, freq = 330, amp = 0.3, dec = 1.2, tone = 0.5, pan = 0, send = 0.3|
    var e = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var sig = Pluck.ar(WhiteNoise.ar * tone.clip(0.05, 1), Impulse.ar(0), 0.2, freq.clip(40, 4000).reciprocal, dec * 2, 0.3);
    sig = LPF.ar(sig, (freq * 8).clip(200, 12000).min(SampleRate.ir * 0.42)) * e;
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // a band of air that can sweep: long \dur for waves and risers, short for shakers. sweep > 1 rises, < 1 falls
  SynthDef(\noise, { |out = 0, freq = 2000, amp = 0.12, att = 0.4, dec = 1.2, bw = 0.5, sweep = 1, pan = 0, send = 0.5|
    var e = EnvGen.kr(Env.perc(att, dec, 1, 0), doneAction: 2);
    var f = (freq * (sweep.clip(0.1, 8) ** EnvGen.kr(Env.perc(att, dec)))).clip(80, 16000).min(SampleRate.ir * 0.42);
    var sig = BPF.ar(PinkNoise.ar(3), f, bw.clip(0.05, 2)) * e;
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // Long field recordings are musical layers, not one-shots. Every bundled nature file is stereo; `start` chooses
  // a different window on each event while slow envelopes make the joins disappear.
  SynthDef(\nature, { |out = 0, buf = 0, amp = 0.1, rate = 1, start = 0, len = 24, att = 4, rel = 6,
                       hp = 40, lp = 12000, pan = 0, send = 0.55|
    var hold = (len - att - rel).max(0.1);
    var env = EnvGen.kr(Env.linen(att.max(0.02), hold, rel.max(0.02), 1, \sine), doneAction: 2);
    var sig = PlayBuf.ar(2, buf, BufRateScale.kr(buf) * rate.clip(0.5, 2), 1,
      start.clip(0, 0.98) * BufFrames.kr(buf), loop: 1);
    sig = LPF.ar(HPF.ar(sig, hp.clip(20, 6000)), lp.clip(300, 16000).min(SampleRate.ir * 0.42));
    sig = Balance2.ar(sig[0], sig[1], pan.clip(-1, 1), amp) * env;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  // Close-recorded tactile material: fingertips, marbles and future object recordings. Events choose a window and
  // playback speed; short fades retain the physical attack while preventing clicks at slice boundaries.
  SynthDef(\texture, { |out = 0, buf = 0, amp = 0.1, rate = 0.7, start = 0, len = 4, att = 0.015, rel = 0.7,
                        hp = 35, lp = 10000, pan = 0, send = 0.55, sub = 0, subfreq = 50|
    var hold = (len - att - rel).max(0.02);
    var env = EnvGen.kr(Env.linen(att.max(0.003), hold, rel.max(0.02), 1, \sine), doneAction: 2);
    // The contact body is the only low end the ambient base has. Its decay scales with the slice, and it still
    // rides \amp: it cannot become a sustained bass voice. Measured solo, the old body (x2, pure sine, 38-58 Hz) put
    // the fingertip slot at -22 dBFS in the sub band against -47 for the waves: every landing was a boom 25 dB over
    // the bed, which is what "boomy" and "ominous" were. It is now a woody knock: a fundamental with a soft second
    // harmonic, warm-low (clip to 120 Hz so recipes can sit it at D2/A2) and 9 dB lower at the same \sub.
    var bodyEnv = EnvGen.kr(Env.perc(0.003, (len * 0.3).clip(0.16, 1.4), 1, -5));
    var bodyF = XLine.kr(subfreq.clip(36, 120) * 1.28, subfreq.clip(36, 120), 0.11);
    var body = (SinOsc.ar(bodyF, 0.25) + (SinOsc.ar(bodyF * 2, 0.6) * 0.3))
      * bodyEnv * amp * sub.clip(0, 0.9) * 0.7;
    var sig = PlayBuf.ar(2, buf, BufRateScale.kr(buf) * rate.clip(0.25, 1.5), 1,
      start.clip(0, 0.96) * BufFrames.kr(buf), loop: 1);
    sig = LPF.ar(HPF.ar(sig, hp.clip(20, 5000)), lp.clip(300, 16000).min(SampleRate.ir * 0.42));
    // Close materials are the foreground detail. The source recordings average about -28 to -33 dBFS; this lift
    // keeps them present beside the field recordings without asking every recipe to overdrive its amp.
    sig = ((Balance2.ar(sig[0], sig[1], pan.clip(-1, 1), amp) * env) + (body ! 2)) * 1.35;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  // A sample becomes a weather system rather than a clip. Mono source buffers feed independently panned grains;
  // the pointer, pitch and filter all drift on different slow clocks. `shimmer` is a quiet octave cloud, not a
  // pitch-shifted copy, so attacks never line up twice. GrainBuf's cubic interpolation keeps slowed objects smooth.
  SynthDef(\cloud, { |out = 0, buf = 0, amp = 0.08, rate = 0.65, pos = 0.35, wander = 0.22,
                      grain = 0.28, density = 11, jitter = 0.08, att = 2, sus = 8, rel = 4,
                      hp = 45, lp = 8500, pan = 0, spread = 0.85, shimmer = 0.08, send = 0.82|
    var env = EnvGen.kr(Env.linen(att.max(0.02), sus.max(0.05), rel.max(0.05), 1, \sine), doneAction: 2);
    var pointer = (pos + LFNoise2.kr(0.071).range(wander.neg, wander)).wrap(0.02, 0.98);
    var pitch = rate.clip(0.2, 2) * LFNoise2.kr(2.7).range(1 - jitter.clip(0, 0.45), 1 + jitter.clip(0, 0.45));
    var trig = Dust.ar(density.clip(0.5, 80));
    var sig = GrainBuf.ar(2, trig, grain.clip(0.025, 1.8), buf, pitch, pointer, 4,
      LFNoise2.kr(3.1).range(spread.neg, spread) + pan, -1, 96);
    var halo = GrainBuf.ar(2, Dust.ar((density * 0.23).clip(0.2, 18)), (grain * 1.8).clip(0.05, 2.2), buf,
      pitch * 2.002, (pointer + LFNoise2.kr(0.043).range(-0.08, 0.08)).wrap(0.02, 0.98), 4,
      LFNoise2.kr(1.3).range(-1, 1), -1, 48) * shimmer.clip(0, 0.35);
    sig = LPF.ar(HPF.ar(sig + halo, hp.clip(20, 5000)),
      (lp * LFNoise2.kr(0.09).range(0.72, 1.18)).clip(300, 15000).min(SampleRate.ir * 0.42));
    // GrainBuf has sparse statistical overlap, so nominal amp sits far below the direct sample instruments. The
    // earlier x1.65 lift still measured the base's brush cloud at -55 dBFS solo, i.e. absent under the waves; at x4
    // the same recipe reads about -40 in the body band, level with the bed. tanh is before amp, so this cannot clip.
    sig = LeakDC.ar(sig).tanh * env * amp * 4;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  // A soft physical model for ceramic, wire and ice. One short noise impulse excites inharmonic resonances; a
  // second, detuned bank makes the stereo image breathe. It gives pitched detail without another subtractive synth.
  SynthDef(\porcelain, { |out = 0, freq = 440, amp = 0.06, dec = 3.5, colour = 0.4,
                          irregular = 0.22, pan = 0, send = 0.88|
    var strike = Decay2.ar(Impulse.ar(0), 0.0008, 0.018) * (PinkNoise.ar(0.7) + 0.12);
    var ratios = [1, 1.337, 2.011, 2.697, 4.081] * LFNoise1.kr(0.17 ! 5).range(1 - irregular, 1 + irregular);
    var left = Ringz.ar(strike, (freq * ratios).clip(70, 12000), dec * [1, 0.72, 0.51, 0.34, 0.2]);
    var right = Ringz.ar(DelayN.ar(strike, 0.03, 0.011), (freq * ratios * 1.003).clip(70, 12000), dec * [0.9, 0.78, 0.46, 0.3, 0.18]);
    var sig = [Mix(left), Mix(right)] * [1 - (pan * 0.35), 1 + (pan * 0.35)];
    sig = LPF.ar(sig, (1800 + (colour.clip(0, 1) * 9000)).min(SampleRate.ir * 0.42));
    sig = (sig * 0.7).tanh * EnvGen.kr(Env.perc(0.002, dec.max(0.2)), doneAction: 2) * amp;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  // Close-mic water: a soft low bubble plus short filtered surface detail. `sub` is independent of pitch so high
  // ripples can still move a subwoofer; the dry component keeps it tactile instead of turning into a reverb bell.
  SynthDef(\droplet, { |out = 0, freq = 220, sub = 55, amp = 0.05, dec = 0.9, tone = 0.35, splash = 0.45, pan = 0, send = 0.68|
    var bodyEnv = EnvGen.kr(Env.perc(0.002, dec.max(0.1), 1, -5));
    var subEnv = EnvGen.kr(Env.perc(0.004, (dec * 1.35).max(0.14), 1, -6), doneAction: 2);
    var waterEnv = EnvGen.kr(Env.perc(0.001, (0.08 + (splash.clip(0, 1) * 0.32))));
    var bubble = SinOsc.ar(XLine.kr(sub.clip(36, 95) * 1.65, sub.clip(36, 95), 0.11), 0.4) * subEnv * 0.72;
    var skin = SinOsc.ar(XLine.kr(freq.clip(90, 1800) * 1.18, freq.clip(90, 1800), 0.055), 0.2) * bodyEnv * 0.24;
    var grains = Decay2.ar(Dust2.ar(18 + (splash * 55)), 0.001, 0.025) * PinkNoise.ar;
    var water = BPF.ar(grains, (freq * (2.2 + (tone.clip(0, 1) * 5))).clip(350, 8500), 0.32) * waterEnv * (0.12 + (splash * 0.38));
    var sig = LeakDC.ar(bubble + skin + water).tanh;
    sig = Pan2.ar(sig, pan.clip(-1, 1), amp) * 1.4;   // +3 dB: the quiet organic voices were under the bed at their own recipe levels
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;

  // Dry branch/seed impact. Three inharmonic resonances make it woody rather than a pitched drum.
  SynthDef(\twig, { |out = 0, freq = 520, amp = 0.045, dec = 0.24, tone = 0.45, hollow = 0.5, pan = 0, send = 0.72|
    var hit = Decay2.ar(Impulse.ar(0), 0.0005, 0.01) * (WhiteNoise.ar(0.7) + 0.25);
    var body = Ringz.ar(hit, freq.clip(100, 5000) * [1, 1.61, 2.43], [dec, dec * 0.58, dec * 0.31]).sum;
    var snap = HPF.ar(hit, (1800 + (tone.clip(0, 1) * 6500)).min(SampleRate.ir * 0.42));
    var sig = ((body * (0.7 + (hollow.clip(0, 1) * 0.5))) + (snap * (0.08 + (tone * 0.22)))).tanh;
    sig = Pan2.ar(sig, pan.clip(-1, 1), amp) * EnvGen.kr(Env.perc(0.001, dec.max(0.04)), doneAction: 2) * 1.45;   // +3 dB: the quiet organic voices were under the bed at their own recipe levels
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  // A short cloud of leaf/sand motion. `grain` changes the internal flutter without imposing a beat grid.
  // Widened, because one fixed narrow band read as a static hiss under the field recordings rather than as air:
  //   `sweep` travels the band centre across the event (2 = up an octave, 0.5 = down one), and `air` adds the
  //   unpitched top - broadband, above the band, no resonance - which is the register the bed leaves empty.
  SynthDef(\rustle, { |out = 0, freq = 2600, amp = 0.032, dec = 1.2, grain = 18, bw = 0.55, sweep = 1, air = 0.35, pan = 0, send = 0.78|
    var env = EnvGen.kr(Env.perc(0.02, dec.max(0.08), 1, -3), doneAction: 2);
    var flutter = 0.18 + Decay2.ar(Dust2.ar(grain.clip(2, 80)), 0.006, 0.08).abs;
    var src = PinkNoise.ar(2) * flutter;
    var f = (freq.clip(180, 12000) * (sweep.clip(0.2, 6) ** EnvGen.kr(Env.perc(0.02, dec.max(0.08)))))
      .clip(150, 14000).min(SampleRate.ir * 0.42);
    var top = (f * 2.4).clip(1500, 15000).min(SampleRate.ir * 0.42);
    var sig = BPF.ar(src, f, bw.clip(0.08, 2.4)) + (HPF.ar(HPF.ar(src, top), top) * air.clip(0, 1) * 0.9);
    // Air has far less RMS energy than the water bed and vanished at recipe level. This lift keeps it clearly present
    // while its short envelopes and long gaps prevent it becoming a constant hiss.
    sig = Pan2.ar(sig * env, pan.clip(-1, 1), amp) * 4.5;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;

  // Tactile sub impulse: a body you feel rather than a note. A short drop into a low sine, a brief contact skin on
  // top, and a tail long enough to be felt. Unpitched by intention, and it reads `tune` rather than `\freq` so it can
  // share one slot with the noise voices under a Pwrand without ever being handed their band centre. The internal
  // gain lets it run from the same \amp range as \rustle in one pattern; it is deliberately lower than a sine at
  // that amp would suggest, because a rare low impulse beside airy noise wants to be felt, not to slam.
  SynthDef(\stone, { |out = 0, tune = 46, amp = 0.05, dec = 0.9, bend = 0.7, skin = 0.35, tone = 0.4, pan = 0, send = 0.35|
    var f = tune.clip(26, 110);
    var drop = EnvGen.kr(Env.perc(0.001, (dec * 0.28).clip(0.04, 0.6)));
    var bodyEnv = EnvGen.kr(Env.perc(0.006, dec.clip(0.12, 4), 1, -4), doneAction: 2);
    var body = SinOsc.ar((f * (1 + (bend.clip(0, 3) * drop))).clip(24, 320), 0.3) * bodyEnv;
    var hit = Decay2.ar(Impulse.ar(0), 0.0008, 0.02) * PinkNoise.ar(1.2);
    var contact = BPF.ar(hit, (600 + (tone.clip(0, 1) * 3200)).clip(120, 7000), 0.7) * skin.clip(0, 1) * 0.6;
    var sig = LeakDC.ar(body + contact).tanh;
    sig = Pan2.ar(sig, pan.clip(-1, 1), amp) * 2.6;
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;

  // Warm harmonic light. The ambient set had no tonal warmth at all: its only sustained layer was a granular cloud
  // that measured -55 dBFS, and its only lows were sub impulses. This is the warm voice: a sine fundamental, a soft
  // second harmonic, and two barely detuned saws low-passed at a few times the fundamental (the "aurora borealis"
  // trick from docs/borrowed-techniques.md: warmth is a low-pass tied to the note, not a brighter oscillator).
  // Each voice drifts on its own slow clock, so a chord never sits dead still and never beats the same way twice.
  // Rand, not .rand, because .rand inside a SynthDef runs once at build time (see the trap in that doc). Attacks
  // are seconds long by design: a slow attack is the mechanism for warm tonal material, not a limiter on it.
  // `shine` adds a quiet third and fourth partial that glimmer on their own slow clock (the space-organ top);
  // `swell` lets the held chord breathe, so a long sustain is never a flat line. The two saws are split left and
  // right rather than summed, which is where the width comes from: one voice, two slightly different sides.
  // `saw` 0..1 is the organ: it raises the saw share, opens the low-pass, and adds an octave-up saw pair, so the
  // same voice runs from a warm sine glow (0) to a wide, bright space-organ chord (1) without changing instrument.
  SynthDef(\glow, { |out = 0, freq = 110, amp = 0.05, att = 7, sus = 12, rel = 9, warm = 3.2, drift = 1, breath = 0.12,
                     shine = 0.3, swell = 0.4, saw = 0.3, pan = 0, send = 0.6|
    var env = EnvGen.kr(Env.linen(att.max(0.05), sus.max(0.05), rel.max(0.05), 1, \sine), doneAction: 2);
    var wob = 1 + (SinOsc.kr(Rand(0.02, 0.06), Rand(0, 2pi)) * Rand(0.0008, 0.0022) * drift.clip(0, 3));
    var f = freq.clip(30, 2000) * wob;
    var body = SinOsc.ar(f) * 0.55 + (SinOsc.ar(f * 2, Rand(0, 2pi)) * 0.12);
    var organ = saw.clip(0, 1);
    var cut = (f * warm.clip(1.5, 8) * (1 + (organ * 2.2)) * LFNoise2.kr(0.05).range(0.8, 1.2)).clip(80, 9000).min(SampleRate.ir * 0.42);
    var grain = LPF.ar(Saw.ar(f * [0.9985, 1.0015]) + (Saw.ar(f * [2.003, 1.996]) * organ * 0.45), cut) * (0.22 + (organ * 0.4));
    var air = BPF.ar(PinkNoise.ar, (f * 4).clip(200, 5000).min(SampleRate.ir * 0.42), 0.4) * breath.clip(0, 1) * 0.15;
    var glimmer = LPF.ar((SinOsc.ar(f * 3, Rand(0, 2pi)) * LFNoise2.kr(Rand(0.05, 0.11)).range(0.2, 1))
      + (SinOsc.ar(f * 4, Rand(0, 2pi)) * 0.6 * LFNoise2.kr(Rand(0.04, 0.09)).range(0.1, 1)), 3600.min(SampleRate.ir * 0.42))
      * shine.clip(0, 1) * 0.16;
    var breathe = 1 - (LFTri.kr(Rand(0.025, 0.06), Rand(0, 4)).range(0, 1) * swell.clip(0, 1) * 0.55);
    var sig = ((body + grain + air + glimmer) * 1.2).tanh * env * breathe;
    sig = Balance2.ar(sig[0], sig[1], (pan + SinOsc.kr(Rand(0.01, 0.03), Rand(0, 2pi), 0.25)).clip(-1, 1), amp);
    Out.ar(out, sig); Out.ar(~fx, sig * send);
  }).add;
  SynthDef(\stab, { |out = 0, freq = 440, amp = 0.1, cutoff = 1800, dec = 0.16, send = 1, crush = 0, fold = 0|
    var sig = ~col.(RLPF.ar(Splay.ar(Saw.ar(freq * [0.994, 1, 1.006])), cutoff.min(SampleRate.ir * 0.42), 0.35), crush, fold)
      * EnvGen.kr(Env.perc(0.004, dec), doneAction: 2);
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  SynthDef(\space, { |out = 0, dt = 0.346|
    var dry = ~safe.(In.ar(~fx, 2)), echo, wet, mod;
    // Tempo-related repeats establish depth; four short modulated allpasses smear their grid into a moving tail.
    echo = CombC.ar(dry, 1, dt.lag(0.5), 3.8);
    wet = dry + (echo * 0.32);
    mod = LFNoise2.kr([0.071, 0.083]).range(-0.0025, 0.0025);
    wet = AllpassC.ar(wet, 0.08, [0.0297, 0.0371] + mod, 3.6);
    wet = AllpassC.ar(wet, 0.09, [0.0411, 0.0437] - mod, 4.8);
    wet = AllpassC.ar(wet, 0.12, [0.0713, 0.0899] + (mod * 0.7), 5.7);
    wet = AllpassC.ar(wet, 0.16, [0.1013, 0.1259] - (mod * 0.5), 6.4);
    // The wet path is high-passed at 150, not 85: reverb tails below that only ever read as mud, and mud was what
    // the ambient set measured as (sub 15 dB over body). Nothing musical lives in a reverb tail under 150 Hz.
    wet = LPF.ar(HPF.ar(wet, 150), 9200.min(SampleRate.ir * 0.42));
    wet = FreeVerb2.ar(wet[0], wet[1], 1, 0.92, 0.58);
    Out.ar(out, ~safe.((wet * 0.3) + (echo * 0.2)));
  }).add;
  // vocals: a phrase rendered by the host (macOS `say`) and loaded as a buffer. chop = where in the phrase to start
  // (0..1), len = how long to let it speak, rate = pitch/speed. Short len + a pattern of chops = a vocal hook.
  // ~tape.(wow, flut) : a playback-rate multiplier that makes a sample drift like tape instead of sitting dead still.
  // From schollz/supercollisions (badtapeplayer.scd). Two details carry it: the wow runs at turntable speed (33 rpm)
  // and is raised to an ODD power, which gives sharp uneven dips rather than an even vibrato, and it is clipped to
  // one side, because tape drags and never speeds up. Both default to 0, so a voice is bit-exact until asked.
  ~tape = { |wow = 0, flut = 0|
    1 + (wow * (SinOsc.kr(33 / 60) ** 11)).min(0) + (flut * SinOsc.kr(6 + LFNoise2.kr(2)))
  };
  // Xenakis's dynamic stochastic synthesis: the waveform is a handful of breakpoints that random-walk every single
  // cycle, so it never repeats exactly. Vanilla SuperCollider (GendynUGens), no plugins needed. It is the one voice
  // in the palette that is noisy BY CONSTRUCTION rather than by adding noise - good for grit basses, broken-glass
  // percussion and leads that will not sit still. knum trades grit for tone: 3-6 is rough and vocal, 20+ smooths out.
  SynthDef(\gendy, { |out = 0, freq = 220, amp = 0.2, knum = 12, chaos = 0.6, scale = 0.5, att = 0.003, dec = 0.4,
                     cutoff = 4000, res = 0.3, pan = 0, send = 0.4, duck = 0, crush = 0, fold = 0|
    var e = EnvGen.kr(Env.perc(att, dec), doneAction: 2);
    var k = knum.clip(2, 32);
    var sig = Gendy1.ar(1, 1, chaos.clip(0, 1), chaos.clip(0, 1), freq * 0.95, freq * 1.05,
      scale.clip(0, 1), scale.clip(0, 1), k, k, 0.6);
    sig = ~col.(RLPF.ar(sig, cutoff.clip(80, 12000).min(SampleRate.ir * 0.42), res.clip(0.05, 1)), crush, fold) * e;
    sig = sig * (1 - (In.kr(~duck) * duck).clip(0, 1));
    Out.ar(out, Pan2.ar(sig.tanh, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // one-shot sampler: the drum machine voices. dec is a choke - leave it long and PlayBuf's own doneAction frees the
  // synth when the file ends; set it short and the hat closes. Buffers are mono, so PlayBuf reads one channel.
  SynthDef(\smp, { |out = 0, buf = 0, amp = 0.5, rate = 1, dec = 8, pan = 0, send = 0.2, hp = 20, duck = 0, wow = 0, flut = 0, crush = 0, fold = 0|
    var e = EnvGen.kr(Env.linen(0.001, dec, 0.008, 1, \sine), doneAction: 2);
    var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * rate * ~tape.(wow, flut), 1, 0, 0, doneAction: 2) * e;
    sig = ~col.(HPF.ar(sig, hp.clip(20, 18000)), crush, fold) * (1 - (In.kr(~duck) * duck).clip(0, 1));
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // pitched multisample. Pbind hands us freq, so \midinote and \ctranspose both land here; rootfreq is the pitch the
  // chosen buffer was recorded at, so the playback rate is freq/rootfreq and nothing stretches more than a tone.
  SynthDef(\keys, { |out = 0, buf = 0, freq = 261.626, rootfreq = 261.626, amp = 0.3, att = 0.001, dec = 1.5, rel = 0.12, pan = 0, send = 0.3, duck = 0, hp = 20, wow = 0, flut = 0, crush = 0, fold = 0|
    var e = EnvGen.kr(Env.linen(att, dec, rel, 1, \sine), doneAction: 2);
    // doneAction 0 on the PlayBuf: with 2 on both, whichever ended first freed the synth, so a \dec longer than the
    // sample (likely on a high note, which plays back faster and so runs out sooner) cut the release off.
    var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * (freq / rootfreq) * ~tape.(wow, flut), 1, 0, 0, doneAction: 0) * e;
    sig = ~col.(HPF.ar(sig, hp.clip(20, 18000)), crush, fold) * (1 - (In.kr(~duck) * duck).clip(0, 1));
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  SynthDef(\vox, { |out = 0, buf = 0, rate = 1, note = 0, chop = 0, len = 0.4, amp = 0.5, pan = 0, send = 0.4, hp = 180|
    var env = EnvGen.kr(Env.linen(0.004, len, 0.03), doneAction: 2);
    var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * rate * note.midiratio, 1, chop.clip(0, 0.98) * BufFrames.kr(buf), 0) * env;
    sig = HPF.ar(sig, hp);
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  // a voice held still: grains read around one point of the phrase (`chop`), so a syllable becomes a sustained,
  // pitched vowel. \note in semitones; arrays make vocal chords. The Fred again.. trick, more or less.
  SynthDef(\voxpad, { |out = 0, buf = 0, note = 0, chop = 0.3, len = 1.5, att = 0.08, rel = 0.6, amp = 0.35, spread = 0.02, send = 0.7, hp = 200, duck = 0.5|
    var env = EnvGen.kr(Env.linen(att, len, rel, 1, \sine), doneAction: 2) * (1 - (In.kr(~duck) * duck).clip(0, 1));
    var pos = (chop + LFNoise1.kr(7).range(spread.neg, spread)).clip(0, 0.98);
    var sig = GrainBuf.ar(2, Impulse.ar(38), 0.11, buf, BufRateScale.kr(buf) * note.midiratio, pos, 2, LFNoise1.kr(3) * 0.6);
    sig = HPF.ar(sig, hp) * env;
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  // a choir with no singers: detuned saws and breath through five moving formants. vowel 0..4 = a e i o u
  SynthDef(\choir, { |out = 0, freq = 220, amp = 0.12, vowel = 0, att = 0.5, sus = 2, rel = 1.5, send = 0.7, duck = 0.6, bright = 1|
    var env = EnvGen.kr(Env.linen(att, sus, rel, 1, \sine), doneAction: 2) * (1 - (In.kr(~duck) * duck).clip(0, 1));
    var vib = SinOsc.kr(5.2 + LFNoise1.kr(0.3), 0, 0.006, 1);
    var src = Mix(Saw.ar(freq * vib * [0.994, 1, 1.007, 0.5])) * 0.25 + (PinkNoise.ar(0.06));
    var v = (vowel + LFNoise1.kr(0.2).range(-0.25, 0.25)).clip(0, 4);
    var f = [[800, 1150, 2900, 3900, 4950], [350, 2000, 2800, 3600, 4950], [270, 2140, 2950, 3900, 4950], [450, 800, 2830, 3800, 4950], [325, 700, 2700, 3800, 4950]];
    var a = [0, -6, -32, -20, -50].dbamp, a2 = [0, -20, -15, -40, -56].dbamp;
    var sig = Mix.fill(5, { |i| BPF.ar(src, SelectX.kr(v, f.collect(_[i])) * bright, 0.06 + (i * 0.01)) * SelectX.kr(v.clip(0, 1), [a[i], a2[i]]) }) * 9;
    sig = Splay.ar([sig, DelayN.ar(sig, 0.03, 0.013), DelayN.ar(sig, 0.03, 0.021)]) * env;
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  // the DJ mixer: a filter and an echo across the whole mix, for transitions
  // Crossfade only sanitised signals: near-Nyquist filters can become non-finite, even in an inactive branch.
  // The delay return sits outside the wet/dry blend so releasing a wash does not sever its tail.
  SynthDef(\djfx, { |hp = 30, lp = 18000, echo = 0, dt = 0.346, on = 0|
    var dry = ~safe.(In.ar(0, 2)), wet, tail, blend = on.clip(0, 1).lag(0.45);
    wet = HPF.ar(HPF.ar(dry, hp.clip(30, 8000).lag(0.08)), hp.clip(30, 8000).lag(0.08));
    wet = LPF.ar(LPF.ar(wet, lp.clip(200, 18000).min(SampleRate.ir * 0.42).lag(0.08)), lp.clip(200, 18000).min(SampleRate.ir * 0.42).lag(0.08));   // at 24 kHz (AirPods in headset mode) an 18 kHz low-pass is above Nyquist: unstable, and it screamed
    wet = ~safe.(wet);   // sanitise BEFORE multiplying: an inactive NaN branch still poisons a crossfade
    tail = ~safe.(CombL.ar(wet * echo.lag(0.25), 1, dt.lag(0.5), 3.5));
    ReplaceOut.ar(0, (dry * (1 - blend)) + (wet * blend) + tail);   // echo decays even after the wet path fades out
  }).add;
  // Transition sounds are SUSTAINED, so at the same peak they are far louder than a track made of short hits:
  // they sit well under the mix on purpose (measured: a ride should not raise the master's average level).
  SynthDef(\riser, { |dur = 4, amp = 0.028|
    var env = EnvGen.kr(Env([0, 1, 0], [dur, 0.05], [3, 0]), doneAction: 2);
    var sig = BPF.ar(PinkNoise.ar(2), env.linexp(0, 1, 250, 4200), 0.45) + (LPF.ar(Saw.ar(env.linexp(0, 1, 110, 440) * [1, 1.01]), 1800) * 0.12);
    sig = LPF.ar(Pan2.ar(sig.sum, SinOsc.kr(env * 6) * 0.5), 6000) * env * amp;
    Out.ar(0, sig); Out.ar(~fx, sig * 0.5);
  }).add;
  SynthDef(\crash, { |amp = 0.07|
    var sig = LPF.ar(HPF.ar(PinkNoise.ar(2), 1800), 9000) * EnvGen.kr(Env.perc(0.002, 1.8, 1, -5), doneAction: 2);
    Out.ar(0, sig * amp ! 2); Out.ar(~fx, sig * amp * 0.6 ! 2);
  }).add;
  SynthDef(\master, { |shaper = 0, drive = 0|
    // 2.6 was set when the harmony sat 15 dB under the drums. Lifting it x2.4 put the mix 3 dB into the limiter
    // on every window: the balance was right and the level was not, so the drive comes down to match.
    var sig = ~safe.(In.ar(0, 2)) * 1.7, sat;
    sig = Compander.ar(sig, sig, 0.35, 1, 0.5, 0.005, 0.12);
    // Soft saturation between the compressor and the limiter: the chain used to go straight from 2:1 compression to
    // a hard Limiter, so every peak was clipped rather than rounded. The wavetable-Shaper idea is from
    // schollz/supercollisions (compressor.scd); the curve is not - mu-law at mu=510 lifts a -20 dB signal by 16 dB,
    // which is a companding curve, not a saturator. tanh normalised to pass through (1,1) is nearly linear low down
    // and only rounds the top. Unity slope at zero and NO makeup gain: normalising it to pass through (1,1) added
    // 2.4 dB and put the reference mix 2.3 dB inside the limiter. Sanitized before the crossfade, because inf * 0 is NaN.
    sat = ~safe.(Shaper.ar(shaper, sig.clip2(0.99)));
    // LinXFade2, not SelectX: SelectX is an EQUAL-POWER crossfade, and these two branches are the same signal,
    // so mixing them that way added ~3 dB in the middle and put the mix inside the limiter. Linear is correct
    // for correlated signals.
    sig = LinXFade2.ar(sig, sat, (drive.clip(0, 1).lag(0.1) * 2) - 1);
    SendReply.kr(Impulse.kr(4), '/head', [A2K.kr(Peak.ar(sig, Impulse.ar(4)).reduce(\max))]);   // pre-limiter
    ReplaceOut.ar(0, Limiter.ar(sig, 0.95, 0.004));
  }).add;
  SynthDef(\vol, { |vol = 1| ReplaceOut.ar(0, In.ar(0, 2) * vol.lag(0.05)) }).add;
  // Every voice passes through the same post-instrument colour stage. This makes an ambient filter move reliable:
  // \fxhp / \fxlp / \fxdrive / \fxspace / \fxmotion / \fxgate / \fxoctave affect whatever instrument is currently in the slot instead
  // of being silently ignored by SynthDefs that do not happen to expose their own filter controls.
  SynthDef(\slottap, { |in, slot = 1, hp = 30, lp = 18000, drive = 0, space = 0, motion = 0, rate = 0.08, gate = 0, gaterate = 0.5, octave = 0|
    var st = ~safe.(In.ar(in, 2)), movingLp, coloured, saturated, spacious, sig, chain, mid, side, fast, slow;
    var travel, sweep, drift, gated, shifted;
    var amp = { |x| Amplitude.kr(x, 0.01, 0.25) };
    // motion was a slow random wobble, and LFNoise2 almost never reaches its extremes: a "moving filter" that
    // measured, and sounded, like a fixed one. It is a traversal now - a slow sine crosses the whole travel every
    // cycle (about three octaves at motion 1), with a little noise on top so no two passes have the same shape.
    travel = motion.clip(0, 1);
    sweep = SinOsc.kr([rate, rate * 0.93].max(0.005), [0, 0.7]).range(1 - (travel * 0.88), 1);
    drift = LFNoise2.kr([rate * 2.3, rate * 1.9].max(0.01)).range(1 - (travel * 0.18), 1 + (travel * 0.1));
    movingLp = (lp.clip(180, 18000) * sweep * drift).clip(180, 18000).min(SampleRate.ir * 0.42);
    coloured = HPF.ar(HPF.ar(st, hp.clip(25, 7000).lag(0.15)), hp.clip(25, 7000).lag(0.15));
    coloured = LPF.ar(LPF.ar(coloured, movingLp.lag(0.15)), movingLp.lag(0.15));
    saturated = (coloured * (1 + (drive.clip(0, 1) * 7))).tanh / (1 + (drive.clip(0, 1) * 1.8));
    coloured = (coloured * (1 - drive.clip(0, 1))) + (saturated * drive.clip(0, 1));
    spacious = FreeVerb2.ar(coloured[0], coloured[1], 1, 0.88, 0.55);
    st = ~safe.((coloured * (1 - (space.clip(0, 1) * 0.58))) + (spacious * space.clip(0, 1) * 0.58));
    // rhythm on a voice that is ALREADY playing. Without this, the only way to change an existing layer's rhythm
    // is \delta, which restarts the phrase -- so "give the current sound more rhythmic variation" could only be
    // answered by replacing the voice. A scalar gate cuts holes in whatever is in the slot, leaving it intact.
    gated = LFPulse.kr(gaterate.clip(0.02, 8), 0, LFNoise2.kr(gaterate.clip(0.02, 8) * 0.31).range(0.28, 0.72))
      .lag(0.012).range(1 - gate.clip(0, 1), 1);
    st = st * gated;
    // register without replacement: a delay line read at a shifted rate moves the slot up or down (+-2 octaves)
    // whatever instrument is in it. Crossfaded, so octave 0 is bit-identical to no shift at all.
    shifted = PitchShift.ar(st, 0.12, (2 ** octave.clip(-2, 2)), 0, 0.004);
    st = ~safe.(LinXFade2.ar(st, shifted, (octave.abs.clip(0, 2).min(1) * 2) - 1));
    sig = st.sum * 0.5; chain = FFT(LocalBuf(1024), sig);
    mid = amp.(sig); side = amp.((st[0] - st[1]) * 0.5);
    // tail: how much level survives 120 ms of smoothing. A short hit decays away; a reverb or a long pad does not.
    fast = Amplitude.kr(sig, 0.005, 0.02); slow = Amplitude.kr(sig, 0.12, 0.35);
    SendReply.kr(Impulse.kr(7.5), '/slotears', [slot, mid, SpecCentroid.kr(chain),
      amp.(LPF.ar(LPF.ar(sig, 80), 80)), amp.(BPF.ar(sig, 150, 1.0)), amp.(BPF.ar(sig, 700, 1.6)), amp.(BPF.ar(sig, 3000, 1.4)), amp.(HPF.ar(HPF.ar(sig, 7000), 7000)),
      side, slow, fast]);
    Out.ar(0, st);
  }).add;
  // the agent's ears: after the master chain, before the volume stage, so a muted test still reads true
  SynthDef(\ears, {
    var sig = In.ar(0, 2).sum * 0.5;
    var chain = FFT(LocalBuf(2048), sig);
    var amp = { |x| Amplitude.kr(x, 0.01, 0.25) };
    var bands = [
      amp.(LPF.ar(LPF.ar(sig, 80), 80)),
      amp.(BPF.ar(sig, 150, 1.0)),
      amp.(BPF.ar(sig, 700, 1.6)),
      amp.(BPF.ar(sig, 3000, 1.4)),
      amp.(HPF.ar(HPF.ar(sig, 7000), 7000)),
    ];
    SendReply.kr(Impulse.kr(15), '/ears', [amp.(sig), A2K.kr(Peak.ar(sig, Impulse.ar(15))), SpecCentroid.kr(chain), SpecFlatness.kr(chain)] ++ bands ++ [amp.((In.ar(0, 2)[0] - In.ar(0, 2)[1]) * 0.5)]);
    SendReply.kr(Onsets.kr(chain, 0.18), '/onset');
  }).add;
  // the picture's raw material: the master bus itself, low-passed and written into a small ring buffer
  // at a quarter of the sample rate (512 frames = 43 ms), which the TUI fetches 20 times a second
  SynthDef(\scope, { |buf|
    BufWr.ar(LPF.ar(In.ar(0, 2), 5500), buf, Phasor.ar(0, 0.25, 0, 512));
  }).add;
  ~scopeBuf = Buffer.alloc(s, 512, 2);
  s.sync;

  // per-slot taps: each slot plays into its own bus, a small analyser measures it on its own (dry, before the shared
  // echo/reverb and the master dynamics), and passes it on to the master. This is what lets a change to the hats be
  // judged on the hats, not on a master mix where the kick and bass drown it.
  ~slotBus = 6.collect { Bus.audio(s, 2) };
  ~slotTaps = ~slotBus.collect { |bus, i| Synth.tail(s, \slottap, [\in, bus, \slot, i + 1]) };
  OSCdef(\slotears, { |msg| tui.sendMsg(*(['/slotears'] ++ msg[3..])) }, '/slotears');
  OSCdef(\head, { |msg| tui.sendMsg('/head', msg[3]) }, '/head');
  // the saturation curve, as a wavetable. Built before the master node, which reads it by bufnum.
  ~satBuf = Buffer.loadCollection(s, Signal.newFrom(
    Array.fill(1024, { |i| var x = i.linlin(0, 1023, -1.0, 1.0); tanh(x) })
  ).asWavetableNoWrap);
  s.sync;
  ~space = Synth.tail(s, \space);
  ~djfx = Synth.tail(s, \djfx);
  // Off for the benchmark (EARS_NO_GLUE=1), so its numbers stay comparable with runs 1-4 in docs/.
  ~masterfx = Synth.tail(s, \master, [\shaper, ~satBuf, \drive, if("EARS_NO_GLUE".getenv.notNil, 0, 0.55)]);
  Synth.tail(s, \ears);
  Synth.tail(s, \scope, [\buf, ~scopeBuf]);
  Routine { loop { ~scopeBuf.getn(0, 1024, { |d| tui.sendMsg(*(['/scope'] ++ d)) }); 0.05.wait } }.play(SystemClock);
  // the first moments after the master chain is created can contain garbage (uninitialised delay/lookahead memory):
  // keep the output shut until it has flushed, then open it
  ~master = Synth.tail(s, \vol, [\vol, 0]);
  momentsPath.load;
  if(~installMoments.notNil) { ~installMoments.(s, ~master, tui) } { "moments.scd did not load; continuing without it".postln };   // never let this abort the boot before /ready
  fork { 1.wait; ~master.set(\vol, if(mute, 0, 1)) };

  OSCdef(\ears, { |msg| tui.sendMsg(*(['/ears'] ++ msg[3..])) }, '/ears');
  OSCdef(\onset, { tui.sendMsg('/onset') }, '/onset');

  // ~d.(\name, \key, value, ...) : define or replace a voice. Swaps on the next bar, never mid-phrase.
  // Every event is announced to the TUI `s.latency` seconds before it sounds.
  ~d = { |name ... pairs|
    var execution = ~evaluationId ? "", first = true, slotIndex, musical = List.new, colour = IdentityDictionary.new;
    var proxy = Pdef(name), wasPlaying = proxy.isPlaying;
    slotIndex = (name.asString.drop(1).asInteger - 1).clip(0, 5);
    pairs.clump(2).do { |pair|
      if([\fxhp, \fxlp, \fxdrive, \fxspace, \fxmotion, \fxrate, \fxgate, \fxgaterate, \fxoctave].includes(pair[0])) { colour[pair[0]] = pair[1] }
      { musical.addAll(pair) };
    };
    ~scheduledSeconds = ~clock.beats2secs(~clock.nextBar);
    ~clock.schedAbs(~clock.nextBar, {
      ~slotTaps[slotIndex].set(
        \hp, (colour[\fxhp] ? 30).asFloat, \lp, (colour[\fxlp] ? 18000).asFloat,
        \drive, (colour[\fxdrive] ? 0).asFloat, \space, (colour[\fxspace] ? 0).asFloat,
        \motion, (colour[\fxmotion] ? 0).asFloat, \rate, (colour[\fxrate] ? 0.08).asFloat,
        \gate, (colour[\fxgate] ? 0).asFloat, \gaterate, (colour[\fxgaterate] ? 0.5).asFloat,
        \octave, (colour[\fxoctave] ? 0).asFloat
      ); nil
    });
    // PatternProxy normally waits for the previous event's delta before adopting a new source. Ambient events can
    // last 30+ beats, so a valid edit appeared "queued" long after its next-bar receipt. Stop only the scheduler
    // (our self-freeing synth envelopes keep sounding), then launch the replacement exactly on the next bar.
    if(wasPlaying) { proxy.stop };
    proxy = Pdef(name, Pbind(*(musical.asArray ++ [\stretch, 1, \out, ~slotBus[slotIndex],
      \tell, Pfunc { |ev|
        if(first) { first = false; tui.sendMsg('/active', name, execution, s.latency, thisThread.seconds, "pattern_event", Main.elapsedTime) };
        if(ev.isRest.not) { tui.sendMsg('/hit', name, ev[\instrument] ? \default, s.latency, (ev[\amp] ? 0.1).asFloat, thisThread.seconds, thisThread.beats, ((thisThread.beats * 4).round(1) - (thisThread.beats * 4)) / 4) }; 0 }   // signed distance from the 16th grid, in beats
    ]))).quant_(4);
    proxy.play(~clock, quant: 4);
    name
  };
  // ~x.("X---x---X---x-x-") : a step row you can read from the back of the room. X = hit, x = ghost, anything else = rest
  // a list of rows plays one row per pass: ["X---X---X---X---", ..., "X---X---X--XX-X-"] is a groove with a turnaround
  ~x = { |str, amp = 0.9|
    var row = { |r| r.as(Array).collect { |c| case { c == $X } { amp } { c == $x } { amp * 0.55 } { Rest(0) } } };
    var xs = if(str.isString) { row.(str) } { str.collect(row).flatten };
    Pseq(if(xs.isEmpty) { [Rest(0)] } { xs }, inf)   // an empty row would make Pseq spin without ever yielding
  };
  // ~burst.(3, 9) : a close cluster of events, then a hole. Returns \delta values - a handful of short steps and
  // then one long silence, so a texture arrives as a gesture and gets out of the way again. This is the rhythmic
  // figure the ambient bed had no way to express: its patterns were fixed Pseq cycles, so density never changed.
  // `step` is the spacing inside the cluster, `spread` how irregular it is (0 = mechanical, 0.9 = scattered).
  // The arguments are plain numbers, not patterns; pass repeats: 1 for ONE cluster, which is what makes a handful of
  // different bursts composable under a Pwrand (an infinite one embedded there would never yield back).
  ~burst = { |n = 3, gap = 9, step = 0.375, spread = 0.4, repeats = inf|
    var k = n.asInteger.clip(1, 16), g = gap.max(0.25), sp = spread.clip(0, 0.9), h = step.max(0.05);
    Pseq([Pn(Pwhite(h * (1 - sp), h * (1 + sp)), k - 1), Pwhite(g * 0.7, g * 1.3)], repeats)
  };
  // ~rare.(0.08, 0.2) : mostly a rest, occasionally the value. The probability is written where it is read, so a
  // stochastic event is a decision you can see rather than a Pwhite whose tails never arrive. A pattern passed as
  // the value is embedded, so give it a finite length - ~rare.(0.1, Pwhite(0.06, 0.1, 1)) - or it never yields back.
  ~rare = { |p = 0.1, value = 1|
    var q = p.clip(0, 1);
    Pwrand([value, Rest(0)], [q, 1 - q], inf)
  };
  // ~arc.(300, 6000, 24) : a filter that keeps crossing an audible range instead of sitting on a number. Each leg
  // alternates between a low and a high zone, so every pass really travels (at least ~1.5 octaves by construction),
  // and the endpoints and leg lengths are drawn fresh, so no two arcs have the same shape.
  ~arc = { |lo = 300, hi = 6000, secs = 24, curve = \sin|
    var a = lo.max(20), b = hi.max(lo * 3), t = secs.max(1);
    Pseg(Pseq([Pwhite(a, a * 1.5, 1), Pwhite(b * 0.62, b, 1)], inf), Pwhite(t * 0.55, t * 1.45, inf), curve, inf)
  };
  // ~v.("work it") : the buffer holding that phrase. The host renders and loads phrases before it evals the slot.
  ~voxBufs = IdentityDictionary.new;
  ~silence = Buffer.alloc(s, 64, 1); ~silence2 = Buffer.alloc(s, 64, 2);
  ~v = { |text| ~voxBufs[text.asString.asSymbol] ? ~silence };
  OSCdef(\voxload, { |msg|
    var key = msg[1].asString.asSymbol, path = msg[2].asString;
    Buffer.read(s, path, action: { |b| ~voxBufs[key] = b; tui.sendMsg('/voxd', key, b.numFrames) });
  }, '/vox');
  // The sampled kit, read before /ready so no pattern can ever reach a buffer that is not loaded yet.
  // ~k.(\kick) is a drum buffer by file name. For \keys, ~kf and ~kr read the event and give the nearest-root
  // buffer and that root's frequency, so \midinote (and \ctranspose, if the slot sets one) must come before \buf.
  ~kit = IdentityDictionary.new; ~keysBufs = List.new; ~natureBufs = IdentityDictionary.new; ~textureBufs = IdentityDictionary.new; ~grainBufs = IdentityDictionary.new;
  ~sampleDir = thisProcess.nowExecutingPath.dirname +/+ "samples";
  // Guarded: this sits on the critical path to /ready, and anything that throws here aborts waitForBoot and leaves
  // the TUI sitting on "booting SuperCollider..." forever. A missing or unreadable samples folder must degrade to
  // silent sampled voices, not to a dead boot.
  try {
    (~sampleDir +/+ "kit" +/+ "*.wav").pathMatch.do { |f| ~kit[PathName(f).fileNameWithoutExtension.asSymbol] = Buffer.read(s, f) };
    (~sampleDir +/+ "nature" +/+ "*.wav").pathMatch.do { |f|
      var key = PathName(f).fileNameWithoutExtension.asSymbol;
      ~natureBufs[key] = Buffer.read(s, f); ~grainBufs[key] = Buffer.readChannel(s, f, channels: [0]);
    };
    (~sampleDir +/+ "texture" +/+ "*.wav").pathMatch.do { |f|
      var key = PathName(f).fileNameWithoutExtension.asSymbol;
      ~textureBufs[key] = Buffer.read(s, f); ~grainBufs[key] = Buffer.readChannel(s, f, channels: [0]);
    };
    (~sampleDir +/+ "keys" +/+ "*.wav").pathMatch.do { |f|
      var n = PathName(f).fileNameWithoutExtension.split($-).last;
      // a filename that is not piano-<midinote> would parse to 0 and become a root of 8 Hz, so skip it loudly
      if(n.every { |c| c.isDecDigit }) { ~keysBufs.add([n.asInteger, Buffer.read(s, f)]) }
      { ("kit: ignoring " ++ f ++ " (expected keys/<name>-<midinote>.wav)").postln };
    };
  } { |err| ("kit: could not read " ++ ~sampleDir ++ " - " ++ err.errorString ++ "; sampled voices will be silent").postln };
  ~keysBufs = ~keysBufs.asArray.sort { |a, b| a[0] < b[0] };
  ~k = { |name| ~kit[name.asSymbol] ? ~silence };
  ~n = { |name| ~natureBufs[name.asSymbol] ? ~silence2 };
  ~t = { |name| ~textureBufs[name.asSymbol] ? ~silence2 };
  ~g = { |name| ~grainBufs[name.asSymbol] ? ~silence };
  // ~kp.("--s-C--s-s--C-t-") : a row of drum VOICES, read like ~x reads a row of hits. Put it on \buf and the ~x row
  // on \amp and one slot carries a whole percussion layer - clap on the backbeat, shaker between, tambourine on the
  // turnaround - instead of one repeated sample. One char per step:
  //   k K kick · C D clap · n snare · h hat · H open hat · r ride · s shaker · t tambourine · m rim · w cowbell
  //   x crash · c v b conga hi/mid/lo · anything else is silence, which is where the rests in the ~x row land.
  // Voices with more than one file pick between them per hit, so no two hats are the identical sample.
  ~kitChar = IdentityDictionary[
    $k -> [\kick], $K -> [\kick2, \kick3], $C -> [\clap], $D -> [\clap2], $n -> [\snare], $m -> [\rim],
    $h -> [\hat, \hat2, \hat3], $H -> [\open, \open2], $r -> [\ride, \ride2], $s -> [\shaker], $t -> [\tamb],
    $c -> [\congah], $v -> [\congam], $b -> [\congal], $w -> [\cowbell], $x -> [\crash]
  ];
  // ~kv.([\hat, \hat2, \hat3]) : one hit, picked from those files. Prand(..., 1) yields a single value, so it can sit
  // inside a Pseq and re-pick every cycle.
  ~kv = { |names| Prand(names.asArray.collect { |n| ~k.(n) }, 1) };
  ~kp = { |str| var row = { |r| r.as(Array).collect { |ch| ~kv.(~kitChar[ch] ? [\silence]) } }, xs;
    xs = if(str.isString) { row.(str) } { str.collect(row).flatten };
    Pseq(if(xs.isEmpty) { [~kv.([\silence])] } { xs }, inf) };   // a list of rows turns around like ~x. Pseq([], inf) spins sclang forever, so never hand it one
  ~kn = { |note| if(~keysBufs.isEmpty) { [note, ~silence] } { ~keysBufs.minItem { |x| (x[0] - note).abs } } };
  // \midinote is a plain lookup: an Event does NOT run its prototype's midinote function, so a slot written with
  // \degree, \note or \freq gives nil, then an empty array, then zero synths - a slot that goes silent with no error.
  // Fall back through \freq to middle C so the worst case is a wrong note rather than no note at all.
  ~kmidi = { |e| var m = e[\midinote];
    if(m.isNil) { m = e[\freq]; if(m.notNil) { m = m.asArray.collect { |f| f.cpsmidi } } };
    if(m.isNil) { m = [60] };
    m.asArray + (e[\ctranspose] ? 0) };
  ~kf = Pfunc({ |e| ~kmidi.(e).collect { |m| ~kn.(m)[1] } });
  ~kr = Pfunc({ |e| ~kmidi.(e).collect { |m| ~kn.(m)[0].midicps } });
  s.sync;
  ("kit: " ++ ~kit.keys.asArray.sort.join(" ") ++ " · keys: " ++ ~keysBufs.size ++ " notes · nature: " ++ ~natureBufs.keys.asArray.sort.join(" ") ++ " · textures: " ++ ~textureBufs.keys.asArray.sort.join(" ") ++ " · grain: " ++ ~grainBufs.keys.asArray.sort.join(" ")).postln;
  ~hush = { |name|
    if(name.isNil) { Pdef.all.do(_.stop) } { Pdef(name).stop };
    if(name.notNil) { tui.sendMsg('/active', name, ~evaluationId ? "", 0, Main.elapsedTime, "pattern_stopped", Main.elapsedTime) };
    name ? \all
  };

  OSCdef(\eval, { |msg|
    var code = msg[1].asString, id = msg[2], ok = true, res;
    ~evaluationId = msg[3] ? ""; ~scheduledSeconds = -1;
    res = try { code.interpret } { |e| ok = false; e.errorString };
    if(res.isNil and: ok) { ok = false; res = "syntax error (see engine log)" };
    tui.sendMsg('/evald', id, ok.binaryValue, res.asString.keep(200), ~evaluationId, ~scheduledSeconds, s.latency, Main.elapsedTime);
    ~evaluationId = nil;
  }, '/eval');
  // Smooth base tempo moves start on the swap bar; an ordinary tempo command remains immediate.
  OSCdef(\tempo, { |msg|
    var bpm = msg[1].asFloat.clip(40, 240), bars = (msg[2] ? 0).asFloat.max(0), ticket;
    ~tempoSerial = (~tempoSerial ? 0) + 1; ticket = ~tempoSerial;
    ~clock.schedAbs(~clock.nextBar, {
      var start = ~clock.beats, previous = ~clock.tempo;
      if(ticket == ~tempoSerial) {
        ~clock.sched(0, {
          var f = if(bars <= 0) { 1 } { ((~clock.beats - start) / (bars * 4)).clip(0, 1) };
          var eased = f.squared * (3 - (2 * f));
          if(ticket != ~tempoSerial) { nil } {
            ~clock.tempo = previous + (((bpm / 60) - previous) * eased);
            ~space.set(\dt, 0.75 / ~clock.tempo); ~djfx.set(\dt, 0.75 / ~clock.tempo);
            if(f >= 1) { nil } { 0.125 }
          }
        });
      }; nil
    });
  }, '/tempo');
  // Approach the handoff, then open back out over releaseBars. New rides supersede old schedules.
  OSCdef(\transition, { |msg|
    var kind = msg[1].asSymbol, bars = msg[2].asInteger.max(1), releaseBars = (msg[3] ? 2).asFloat.max(0.25);
    var from = ~clock.beats, target = ~clock.nextBar + ((bars - 1) * 4), ticket, dropped = false;
    ~transitionSerial = (~transitionSerial ? 0) + 1; ticket = ~transitionSerial;
    if(kind != \wash) { Synth(\riser, [\dur, (target - from) / ~clock.tempo, \amp, if(kind == \riser, 0.022, 0.03)]) };
    ~djfx.set(\dt, 0.75 / ~clock.tempo, \on, 1);
    ~clock.sched(0, {
      var beat = ~clock.beats, approaching = beat < target;
      var f = if(approaching) { ((beat - from) / (target - from).max(0.01)).clip(0, 1) } { (1 - ((beat - target) / (releaseBars * 4))).clip(0, 1) };
      var eased = f.squared * (3 - (2 * f));
      if(ticket != ~transitionSerial) { nil } {
        if(approaching.not and: { dropped.not }) {
          dropped = true;
          if(kind != \wash) { s.makeBundle(s.latency, { Synth(\crash) }) };
          tui.sendMsg('/dropped', kind);
        };
        case
          { kind == \build } { ~djfx.set(\hp, eased.linexp(0, 1, 30, 2200), \lp, 18000, \echo, 0) }
          { kind == \wash } { ~djfx.set(\hp, 30, \lp, eased.linexp(0, 1, 18000, 500), \echo, eased.squared * 0.3) };
        if(beat >= (target + (releaseBars * 4))) {
          ~djfx.set(\hp, 30, \lp, 18000, \echo, 0, \on, 0); nil
        } { 0.125 }
      }
    });
  }, '/transition');
  OSCdef(\vol, { |msg| ~master.set(\vol, msg[1]) }, '/vol');

  // bar clock for the TUI: bar number and when (in seconds from now) it lands
  ~clock.schedAbs(~clock.nextBar, { tui.sendMsg('/bar', (~clock.beats / 4).round.asInteger, s.latency, ~clock.tempo * 60, thisThread.seconds); 4 });

  tui.sendMsg('/ready', NetAddr.langPort, s.sampleRate);
  "ENGINE READY on %".format(NetAddr.langPort).postln;
};
)
