// What Faust adds: physical models. Nothing here is a sample or an oscillator patch;
// the djembe, marimba and plucked string are simulated resonating bodies.
import("stdfaust.lib");

bpm  = 96;
tick = ba.beat(bpm * 4);
step = (+(tick) : %(16)) ~ _ : -(1) : max(0);
pat(t)  = t, int(step) : rdtable;
trig(t) = tick * (pat(t) > 0);
gate(t) = trig(t) : en.ar(0.001, 0.05) : >(0.01);   // models want a short gate, not an impulse

// djembe: strike position and sharpness change per step, like a hand moving
dPos   = pat(waveform{0.1,0.6,0.8,0.6, 0.2,0.7,0.8,0.3, 0.1,0.6,0.8,0.6, 0.2,0.8,0.5,0.9});
djT    = gate(waveform{1,0,1,1, 0,1,1,0, 1,0,1,1, 0,1,1,1});
djembe = pm.djembe(62, dPos, 0.45, 0.9, djT) * 0.8;
low    = pm.djembe(41, 0.15, 0.3, 1, gate(waveform{1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0})) * 1.1;

// marimba: F major pentatonic arpeggio
mNote  = pat(waveform{65,0,72,0, 69,0,77,74, 0,72,0,69, 74,0,72,0});
mT     = tick * (mNote > 0);
mFreq  = mNote : ba.sAndH(mT) : max(40) : ba.midikey2hz;
marimba = pm.marimba(mFreq, 0.4, 7000, 0.35, 0.8, mT : en.ar(0.001, 0.05) : >(0.01)) * 0.55;

// plucked nylon string for the bass line
sNote  = pat(waveform{41,0,0,0, 0,0,41,0, 38,0,0,0, 0,0,43,0});
sT     = tick * (sNote > 0);
sFreq  = sNote : ba.sAndH(sT) : max(30) : ba.midikey2hz;
string = pm.nylonGuitar(pm.f2l(sFreq), 0.75, 0.9, sT : en.ar(0.001, 0.05) : >(0.01)) * 0.9;

dry    = djembe * 0.5 + low * 0.6 + string * 0.8 + marimba * 0.5;
wet    = marimba * 0.6 + djembe * 0.25;
reverb = re.zita_rev1_stereo(30, 200, 5000, 3.5, 4.5, 48000);
process = dry, wet <: (_, _ : +), (_, _ : +), (!, _ <: reverb)
        : (_, _, *(0.4), *(0.4)) :> (_, _) : (*(2.2), *(2.2)) : (ma.tanh, ma.tanh);
