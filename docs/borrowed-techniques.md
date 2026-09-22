# Techniques worth stealing

Ideas read from published SuperCollider pieces, written down so they are not lost between sessions.

**Licensing: sccode.org states no site-wide licence and none of these pages shows one.** These are
descriptions of technique, not copies of anyone's code. Implement them in our own idiom and credit the
idea with its URL in a comment. Do not paste code from these pages into `tui/engine.scd`.

## Queued, not yet built

### The envelope that never closes — a better `\fxgate`

From *Periodic Lo-Fi Riff*, gosub — https://sccode.org/1-5iO

```supercollider
var env_baseline = LFNoise1.ar(1/3).range(0.1, 0.5);
sig = sig * env.linlin(0, 1, env_baseline, 1);
```

The envelope's **floor** wanders instead of returning to zero, so one voice drifts between pulsing and
sustained with no switch between the two. Our `\fxgate` has a fixed depth and therefore chops the same
way forever. Modulating gate depth slowly would make it breathe. Two lines.

### Incommensurate pulse rates

Same piece: ten voices at `(1 + n * 0.1) * 0.1` Hz — 0.10, 0.11 … 0.19. No two ever align, so the
combined pattern effectively never repeats. Rhythm that emerges from phase rather than from a pattern,
which means it never restarts a phrase — the exact limitation we hit with `\delta`.

### Tape floor as glue

Same piece: `BrownNoise.ar(mul: -45.dbamp)` under everything. A constant, very quiet floor that binds
separate voices into one room. Our set has no such glue.

## A trap, verified

`0.02.rand` inside a SynthDef function is plain Sclang, not a UGen, so it runs **once at build time** and
is baked into the graph's constant pool — every instance of that SynthDef shares the identical value.
Confirmed by building the same definition twice and reading `.constants`: 886.02 in one, 890.73 in the
other, fixed for all instances of each. Per-voice randomness needs `Rand(0, 0.02)`, which is a UGen.

The lo-fi piece above has this bug: its "slight random detune" per partial is identical in all ten voices.

## Already passed to the engine work

- **Slow attack is the mechanism for warm tonal material.** `Env.triangle(5)` in *aurora borealis*
  (https://sccode.org/1-5bi); ASR with 3.2–4 s attack in *Meandering Sines* (https://sccode.org/1-5eE).
- **One voice that morphs between pitched and unpitched**, `SelectX.ar` across Pulse / VarSaw /
  WhiteNoise under `LFNoise2` (*aurora borealis*). Our top end is entirely noise and reads as harsh; a
  voice that crosses the boundary beats adding a warm instrument beside the noisy one.
- **Warmth from a low-pass tied to the fundamental**, `freq * 4` (*aurora borealis*).
- **Per-voice drift**: each voice adds `SinOsc.kr(Rand(0.02, 0.06), 0, Rand(0.1, 2.0))` to its own
  frequency and pans at a shared slow rate with random phase and depth (*Meandering Sines*).
- **Formant-filtered noise, not a choir**, for warm highs (*vowel pads*, https://sccode.org/1-51H).
  Voices and choir stay disabled in ambient; formant-filtered noise is pitched air, not a voice.
- **Paulstretch** (https://sccode.org/1-5d6): overlapping `GrainBuf` grains, `PV_Diffuser` randomising
  phase while preserving magnitude, `(1 - x²)^1.25` window, second grain delayed half a grain length.
  Applied to our own field recordings it would turn rain and brush into warm sustained pads — answering
  "warmer material outside the harsh rain textures" using the rain itself.
