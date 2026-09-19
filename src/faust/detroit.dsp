// THE BRIEF in Faust: the whole track, clock included, is one signal-processing
// expression compiled to WebAssembly. No scheduler, no JS: sample-accurate by construction.
import("stdfaust.lib");

bpm  = 130;
tick = ba.beat(bpm * 4);                        // one impulse per 16th
step = (+(tick) : %(16)) ~ _ : -(1) : max(0);   // 0..15
bar  = (+(tick * (step == 0)) : %(4)) ~ _;      // 0..3

pat(t)     = t, int(step) : rdtable;
trig(t)    = tick * (pat(t) > 0);
perc(a, d) = en.ar(a, d);

// ---- drums -------------------------------------------------------------
kickT = trig(waveform{1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0});
kick  = os.osc(44 + 190 * (kickT : perc(0.001, 0.045))) * (kickT : perc(0.001, 0.36))
      : *(1.6) : ma.tanh;

clapT = trig(waveform{0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0});
clap  = no.pink_noise * 6 : fi.resonbp(1400, 1.6, 1) * (clapT : perc(0.002, 0.17));

acc   = pat(waveform{0.35,0.55,1,0.55, 0.35,0.55,1,0.55, 0.35,0.55,1,0.55, 0.35,0.55,1,0.55});
hat   = no.noise : fi.highpass(3, 8500) * (tick : perc(0.001, 0.03)) * acc * 0.22;
ohatT = trig(waveform{0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0});
ohat  = no.noise : fi.highpass(3, 7000) * (ohatT : perc(0.001, 0.16)) * 0.12;

// ---- bass: saw into a Moog ladder model swept over 8 bars -----------------
bnote = pat(waveform{29,29,0,29, 29,0,0,32, 29,29,29,0, 0,36,39,0});
bassT = tick * (bnote > 0);
bfreq = bnote : ba.sAndH(bassT) : max(20) : ba.midikey2hz;
sweep = 0.30 + 0.22 * os.osc(bpm / 60 / 32);
bass  = os.sawtooth(bfreq) * (bassT : perc(0.003, 0.17)) : ve.moog_vcf(0.55, sweep * 2600) : *(0.9);

// ---- stabs: five detuned saw pairs, chord changes every two bars ----------
stabT   = trig(waveform{0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,1,0});
second  = bar >= 2;
voice(n1, n2) = (os.sawtooth(f * 0.996) + os.sawtooth(f * 1.004)) * 0.5
  with { f = ba.midikey2hz(select2(second, n1, n2)); };
chord   = voice(53,49) + voice(56,53) + voice(60,56) + voice(63,60) + voice(67,63);
stabLfo = 1750 + 850 * os.osc(bpm / 60 / 16);
stab    = chord * (stabT : perc(0.004, 0.16)) : fi.resonlp(stabLfo, 3, 1) : *(0.11);

dtime   = ma.SR * 60 / bpm * 0.75;               // dotted 8th
echo    = + ~ (de.delay(65536, dtime) * 0.45);
wetbus  = (stab : echo) + clap * 0.5;

// ---- mix: dry centre + zita reverb on the wet bus ------------------------
dry     = kick * 0.95 + bass * 0.8 + hat + ohat + clap * 0.55;
reverb  = re.zita_rev1_stereo(20, 200, 6000, 2.8, 3.4, 48000);
process = dry, wetbus <: (_, _ : + ), (_, _ : +), (!, _ <: reverb)
        : (_, _, *(0.35), *(0.35)) :> (_, _) : (*(0.36), *(0.36)) : (ma.tanh, ma.tanh);
