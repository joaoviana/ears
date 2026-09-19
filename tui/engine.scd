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
  ~fx = Bus.audio(s, 2);
  ~clock = TempoClock(130 / 60);

  SynthDef(\kick, { |out = 0, amp = 0.9, tune = 44, dec = 0.36, drive = 1.6, punch = 190|
    var env = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var sig = SinOsc.ar(tune + (punch * EnvGen.kr(Env.perc(0.001, 0.045))));
    Out.ar(out, (sig * env * drive).tanh * amp ! 2);
  }).add;
  // 303-ish: the filter envelope is the instrument. res 0..1, env = how far the filter opens per note
  SynthDef(\acid, { |out = 0, freq = 55, amp = 0.5, cutoff = 500, res = 0.8, env = 2500, dec = 0.18, wave = 0, send = 0.1|
    var osc = SelectX.ar(wave.clip(0, 1), [Saw.ar(freq), Pulse.ar(freq, 0.45)]);
    var fenv = EnvGen.kr(Env.perc(0.002, dec * 0.9));
    var sig = RLPF.ar(osc, (cutoff + (env * fenv)).clip(60, 12000), (1.02 - res.clip(0, 1)).clip(0.04, 1));
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
  SynthDef(\pad, { |out = 0, freq = 220, amp = 0.12, cutoff = 1200, att = 0.8, sus = 2, rel = 2, send = 0.6|
    var e = EnvGen.kr(Env.linen(att, sus, rel, 1, \sine), doneAction: 2);
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.992, 0.998, 1.003, 1.009])), cutoff * LFTri.kr(0.11).range(0.7, 1.3), 0.5) * e;
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  // tuned percussion: tom / conga / blip depending on freq and dec
  SynthDef(\perc, { |out = 0, freq = 180, amp = 0.3, dec = 0.14, pan = 0, send = 0.3, click = 0.3|
    var e = EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    var sig = (SinOsc.ar(freq * (1 + (0.8 * EnvGen.kr(Env.perc(0.001, 0.02))))) + (HPF.ar(WhiteNoise.ar, 3000) * click * EnvGen.kr(Env.perc(0.001, 0.01)))) * e;
    Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2);
  }).add;
  SynthDef(\hat, { |out = 0, amp = 0.2, dec = 0.03, hp = 8500, pan = 0|
    var sig = HPF.ar(WhiteNoise.ar, hp) * EnvGen.kr(Env.perc(0.001, dec), doneAction: 2);
    Out.ar(out, Pan2.ar(sig, pan, amp));
  }).add;
  SynthDef(\clap, { |out = 0, amp = 0.5, send = 0.5|
    var env = EnvGen.kr(Env.perc(0.002, 0.17), doneAction: 2);
    var bursts = Mix.fill(3, { |i| EnvGen.kr(Env.perc(0.001, 0.012), DelayN.kr(Impulse.kr(0), 0.05, i * 0.011)) });
    var sig = BPF.ar(PinkNoise.ar(7), 1400, 0.6) * (env + bursts);
    Out.ar(out, sig * amp ! 2); Out.ar(~fx, sig * send ! 2);
  }).add;
  SynthDef(\bass, { |out = 0, freq = 43, amp = 0.8, cutoff = 600, res = 2.7, dec = 0.17|
    var sig = MoogFF.ar(Saw.ar(freq) + (Pulse.ar(freq * 0.5, 0.4) * 0.4), cutoff, res)
      * EnvGen.kr(Env.perc(0.003, dec), doneAction: 2);
    Out.ar(out, (sig * 1.4).tanh * amp ! 2);
  }).add;
  SynthDef(\stab, { |out = 0, freq = 440, amp = 0.1, cutoff = 1800, dec = 0.16, send = 1|
    var sig = RLPF.ar(Splay.ar(Saw.ar(freq * [0.994, 1, 1.006])), cutoff, 0.35)
      * EnvGen.kr(Env.perc(0.004, dec), doneAction: 2);
    Out.ar(out, sig * amp); Out.ar(~fx, sig * amp * send);
  }).add;
  SynthDef(\space, { |out = 0, dt = 0.346|
    var dry = In.ar(~fx, 2);
    var echo = CombL.ar(dry, 1, dt.lag(0.5), 2.4);
    var wet = FreeVerb2.ar(dry[0] + echo[0], dry[1] + echo[1], 1, 0.86, 0.35);
    Out.ar(out, (wet * 0.4) + (echo * 0.45));
  }).add;
  SynthDef(\master, {
    var sig = In.ar(0, 2) * 2.6;
    sig = Compander.ar(sig, sig, 0.35, 1, 0.5, 0.005, 0.12);
    ReplaceOut.ar(0, Limiter.ar(sig, 0.95, 0.004));
  }).add;
  SynthDef(\vol, { |vol = 1| ReplaceOut.ar(0, In.ar(0, 2) * vol.lag(0.05)) }).add;
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
    SendReply.kr(Impulse.kr(15), '/ears', [amp.(sig), Peak.kr(sig, Impulse.kr(15)), SpecCentroid.kr(chain), SpecFlatness.kr(chain)] ++ bands);
    SendReply.kr(Onsets.kr(chain, 0.18), '/onset');
  }).add;
  // the picture's raw material: the master bus itself, low-passed and written into a small ring buffer
  // at a quarter of the sample rate (512 frames = 43 ms), which the TUI fetches 20 times a second
  SynthDef(\scope, { |buf|
    BufWr.ar(LPF.ar(In.ar(0, 2), 5500), buf, Phasor.ar(0, 0.25, 0, 512));
  }).add;
  ~scopeBuf = Buffer.alloc(s, 512, 2);
  s.sync;

  ~space = Synth.tail(s, \space);
  Synth.tail(s, \master);
  Synth.tail(s, \ears);
  Synth.tail(s, \scope, [\buf, ~scopeBuf]);
  Routine { loop { ~scopeBuf.getn(0, 1024, { |d| tui.sendMsg(*(['/scope'] ++ d)) }); 0.05.wait } }.play(SystemClock);
  ~master = Synth.tail(s, \vol, [\vol, if(mute, 0, 1)]);

  OSCdef(\ears, { |msg| tui.sendMsg(*(['/ears'] ++ msg[3..])) }, '/ears');
  OSCdef(\onset, { tui.sendMsg('/onset') }, '/onset');

  // ~d.(\name, \key, value, ...) : define or replace a voice. Swaps on the next bar, never mid-phrase.
  // Every event is announced to the TUI `s.latency` seconds before it sounds.
  ~d = { |name ... pairs|
    Pdef(name, Pbind(*(pairs ++ [\stretch, 1,
      \tell, Pfunc { |ev| if(ev.isRest.not) { tui.sendMsg('/hit', name, ev[\instrument] ? \default, s.latency, (ev[\amp] ? 0.1).asFloat, thisThread.seconds, thisThread.beats) }; 0 }
    ]))).quant_(4);
    if(Pdef(name).isPlaying.not) { Pdef(name).play(~clock, quant: 4) };
    name
  };
  // ~x.("X---x---X---x-x-") : a step row you can read from the back of the room. X = hit, x = ghost, anything else = rest
  ~x = { |str, amp = 0.9| Pseq(str.as(Array).collect { |c| case { c == $X } { amp } { c == $x } { amp * 0.55 } { Rest(0) } }, inf) };
  ~hush = { |name| if(name.isNil) { Pdef.all.do(_.stop) } { Pdef(name).stop } };

  OSCdef(\eval, { |msg|
    var code = msg[1].asString, id = msg[2], ok = true, res;
    res = try { code.interpret } { |e| ok = false; e.errorString };
    if(res.isNil and: ok) { ok = false; res = "syntax error (see engine log)" };
    tui.sendMsg('/evald', id, ok.binaryValue, res.asString.keep(200));
  }, '/eval');
  // tempo changes land on the next bar, like everything else, and the dotted-8th echo follows
  OSCdef(\tempo, { |msg| var bpm = msg[1]; ~clock.schedAbs(~clock.nextBar, { ~clock.tempo = bpm / 60; ~space.set(\dt, 60 / bpm * 0.75); nil }) }, '/tempo');
  OSCdef(\vol, { |msg| ~master.set(\vol, msg[1]) }, '/vol');

  // bar clock for the TUI: bar number and when (in seconds from now) it lands
  ~clock.schedAbs(~clock.nextBar, { tui.sendMsg('/bar', (~clock.beats / 4).round.asInteger, s.latency, ~clock.tempo * 60, thisThread.seconds); 4 });

  tui.sendMsg('/ready', NetAddr.langPort);
  "ENGINE READY on %".format(NetAddr.langPort).postln;
};
)
