# Orca

Orca makes no sound. It's a grid where every letter is an operator, and it emits MIDI, OSC or UDP. You'd point it at
one of the other engines (SuperDirt over OSC, or a browser synth over WebMIDI).

A four-on-the-floor kick with an offbeat hat, as a grid:

```
.D4..........
..:03C.......      D4 bangs every 4 frames; :03C sends MIDI ch 0, octave 3, note C
.............
..2D4........
...:14C......      same clock, delayed 2 frames: the offbeat, on channel 1
```

Why it's here: the text on screen *is* the performance, which suits "show us your screens", and a small character
grid is a constrained output format an LLM handles well. Why it isn't the show: it's a sequencer only, so it adds a
moving part rather than replacing one.
