// The sound engine for the TUI set. Runs headless under sclang:
//   - boots scsynth (no inputs, so no microphone prompt)
//   - listens on OSC /eval for slot code and interprets it; Pdefs swap on the next 4-beat boundary
//   - an "ears" synth on the master bus streams measurements to the TUI
//   - every scheduled hit is announced to the TUI ahead of time with its logical timestamp and beat, so visuals
//     land on it exactly, however late the message itself arrives
(
var tui = NetAddr("127.0.0.1", ("EARS_PORT".getenv ? "57200").asInteger);
var mute = "SOUNDCHECK_MUTE".getenv.notNil;
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
  SynthDef(\fm, { |out = 0, freq = 440, amp = 0.2, ratio = 2, index = 3, dec = 0.4, pan = 0, send = 0.5|
    var e = EnvGen.kr(Env.perc(0.002, dec), doneAction: 2);
    var sig = SinOsc.ar(freq + (SinOsc.ar(freq * ratio) * freq * index * EnvGen.kr(Env.perc(0.001, dec * 0.5)))) * e;
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
  SynthDef(\bass, { |out = 0, freq = 43, amp = 0.8, cutoff = 600, res = 2.7, dec = 0.17, duck = 0.4|
    var sig = MoogFF.ar(Saw.ar(freq) + (Pulse.ar(freq * 0.5, 0.4) * 0.4), cutoff.min(SampleRate.ir * 0.42), res)
      * EnvGen.kr(Env.perc(0.003, dec), doneAction: 2);
    Out.ar(out, (sig * 1.4).tanh * amp * (1 - (In.kr(~duck) * duck).clip(0, 1)) ! 2);
  }).add;
  SynthDef(\stab, { |out = 0, freq = 440, amp = 0.1, cutoff = 1800, dec = 0.16, send = 1|
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.994, 1, 1.006])), cutoff.min(SampleRate.ir * 0.42), 0.35)
      * EnvGen.kr(Env.perc(0.004, dec), doneAction: 2);
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  SynthDef(\space, { |out = 0, dt = 0.346|
    var dry = ~safe.(In.ar(~fx, 2));
    var echo = CombL.ar(dry, 1, dt.lag(0.5), 2.4);
    var wet = FreeVerb2.ar(dry[0] + echo[0], dry[1] + echo[1], 1, 0.86, 0.35);
    Out.ar(out, ~safe.((wet * 0.4) + (echo * 0.45)));
  }).add;
  // vocals: a phrase rendered by the host (macOS `say`) and loaded as a buffer. chop = where in the phrase to start
  // (0..1), len = how long to let it speak, rate = pitch/speed. Short len + a pattern of chops = a vocal hook.
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
  // Bypassed unless a transition is riding it (`on`). A 2nd-order high-pass parked at 20 Hz, or a low-pass parked
  // next to Nyquist, is numerically unstable in single precision: left in the path it threw huge spikes into the
  // master limiter, which then ducked the whole mix. So the filters only exist while they're doing something.
  SynthDef(\djfx, { |hp = 30, lp = 18000, echo = 0, dt = 0.346, on = 0|
    var dry = ~safe.(In.ar(0, 2)), wet;
    wet = HPF.ar(HPF.ar(dry, hp.clip(30, 8000).lag(0.08)), hp.clip(30, 8000).lag(0.08));
    wet = LPF.ar(LPF.ar(wet, lp.clip(200, 18000).min(SampleRate.ir * 0.42).lag(0.08)), lp.clip(200, 18000).min(SampleRate.ir * 0.42).lag(0.08));   // at 24 kHz (AirPods in headset mode) an 18 kHz low-pass is above Nyquist: unstable, and it screamed
    wet = wet + CombL.ar(wet * echo.lag(0.05), 1, dt, 3.5);
    ReplaceOut.ar(0, Select.ar(on > 0.5, [dry, ~safe.(wet)]));   // a switch, not a crossfade: inf * 0 is NaN
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
  SynthDef(\master, {
    var sig = ~safe.(In.ar(0, 2)) * 2.6;
    sig = Compander.ar(sig, sig, 0.35, 1, 0.5, 0.005, 0.12);
    SendReply.kr(Impulse.kr(4), '/head', [A2K.kr(Peak.ar(sig, Impulse.ar(4)).reduce(\max))]);   // pre-limiter
    ReplaceOut.ar(0, Limiter.ar(sig, 0.95, 0.004));
  }).add;
  SynthDef(\vol, { |vol = 1| ReplaceOut.ar(0, In.ar(0, 2) * vol.lag(0.05)) }).add;
  SynthDef(\slottap, { |in, slot = 1|
    var st = ~safe.(In.ar(in, 2)), sig = st.sum * 0.5, chain = FFT(LocalBuf(1024), sig);
    var amp = { |x| Amplitude.kr(x, 0.01, 0.25) };
    var mid = amp.(sig), side = amp.((st[0] - st[1]) * 0.5);
    // tail: how much level survives 120 ms of smoothing. A short hit decays away; a reverb or a long pad does not.
    var fast = Amplitude.kr(sig, 0.005, 0.02), slow = Amplitude.kr(sig, 0.12, 0.35);
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
  ~slotBus.do { |bus, i| Synth.tail(s, \slottap, [\in, bus, \slot, i + 1]) };
  OSCdef(\slotears, { |msg| tui.sendMsg(*(['/slotears'] ++ msg[3..])) }, '/slotears');
  OSCdef(\head, { |msg| tui.sendMsg('/head', msg[3]) }, '/head');
  ~space = Synth.tail(s, \space);
  ~djfx = Synth.tail(s, \djfx);
  Synth.tail(s, \master);
  Synth.tail(s, \ears);
  Synth.tail(s, \scope, [\buf, ~scopeBuf]);
  Routine { loop { ~scopeBuf.getn(0, 1024, { |d| tui.sendMsg(*(['/scope'] ++ d)) }); 0.05.wait } }.play(SystemClock);
  // the first moments after the master chain is created can contain garbage (uninitialised delay/lookahead memory):
  // keep the output shut until it has flushed, then open it
  ~master = Synth.tail(s, \vol, [\vol, 0]);
  fork { 1.wait; ~master.set(\vol, if(mute, 0, 1)) };

  OSCdef(\ears, { |msg| tui.sendMsg(*(['/ears'] ++ msg[3..])) }, '/ears');
  OSCdef(\onset, { tui.sendMsg('/onset') }, '/onset');

  // ~d.(\name, \key, value, ...) : define or replace a voice. Swaps on the next bar, never mid-phrase.
  // Every event is announced to the TUI `s.latency` seconds before it sounds.
  ~d = { |name ... pairs|
    var execution = ~evaluationId ? "", first = true;
    ~scheduledSeconds = ~clock.beats2secs(~clock.nextBar);
    Pdef(name, Pbind(*(pairs ++ [\stretch, 1, \out, ~slotBus[(name.asString.drop(1).asInteger - 1).clip(0, 5)],
      \tell, Pfunc { |ev|
        if(first) { first = false; tui.sendMsg('/active', name, execution, s.latency, thisThread.seconds, "pattern_event", Main.elapsedTime) };
        if(ev.isRest.not) { tui.sendMsg('/hit', name, ev[\instrument] ? \default, s.latency, (ev[\amp] ? 0.1).asFloat, thisThread.seconds, thisThread.beats, ((thisThread.beats * 4).round(1) - (thisThread.beats * 4)) / 4) }; 0 }   // signed distance from the 16th grid, in beats
    ]))).quant_(4);
    if(Pdef(name).isPlaying.not) { Pdef(name).play(~clock, quant: 4) };
    name
  };
  // ~x.("X---x---X---x-x-") : a step row you can read from the back of the room. X = hit, x = ghost, anything else = rest
  // a list of rows plays one row per pass: ["X---X---X---X---", ..., "X---X---X--XX-X-"] is a groove with a turnaround
  ~x = { |str, amp = 0.9|
    var row = { |r| r.as(Array).collect { |c| case { c == $X } { amp } { c == $x } { amp * 0.55 } { Rest(0) } } };
    Pseq(if(str.isString) { row.(str) } { str.collect(row).flatten }, inf)
  };
  // ~v.("work it") : the buffer holding that phrase. The host renders and loads phrases before it evals the slot.
  ~voxBufs = IdentityDictionary.new;
  ~silence = Buffer.alloc(s, 64, 1);
  ~v = { |text| ~voxBufs[text.asString.asSymbol] ? ~silence };
  OSCdef(\voxload, { |msg|
    var key = msg[1].asString.asSymbol, path = msg[2].asString;
    Buffer.read(s, path, action: { |b| ~voxBufs[key] = b; tui.sendMsg('/voxd', key, b.numFrames) });
  }, '/vox');
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
  // tempo changes land on the next bar, like everything else, and the dotted-8th echo follows
  OSCdef(\tempo, { |msg| var bpm = msg[1]; ~clock.schedAbs(~clock.nextBar, { ~clock.tempo = bpm / 60; ~space.set(\dt, 60 / bpm * 0.75); nil }) }, '/tempo');
  // /transition kind bars : ride the mixer from now until a bar line `bars` ahead, then let go on the downbeat.
  //   build = high-pass sweeps up under a riser · wash = low-pass closes while the echo takes over · riser = riser only
  OSCdef(\transition, { |msg|
    var kind = msg[1].asSymbol, bars = msg[2].asInteger.max(1);
    var from = ~clock.beats, target = ~clock.nextBar + ((bars - 1) * 4);
    Synth(\riser, [\dur, (target - from) / ~clock.tempo, \amp, if(kind == \riser, 0.022, 0.03)]);
    ~djfx.set(\dt, 0.75 / ~clock.tempo, \on, 1);
    ~clock.sched(0, {
      var f = ((~clock.beats - from) / (target - from)).clip(0, 1);
      if(~clock.beats >= (target - 0.01)) {
        ~djfx.set(\hp, 30, \lp, 18000, \echo, 0, \on, 0);
        s.makeBundle(s.latency, { Synth(\crash) });
        tui.sendMsg('/dropped', kind);
        nil
      } {
        case
          { kind == \build } { ~djfx.set(\hp, f.linexp(0, 1, 30, 2200)) }
          { kind == \wash } { ~djfx.set(\lp, f.linexp(0, 1, 18000, 350), \echo, f.squared * 0.35) };
        0.125
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
