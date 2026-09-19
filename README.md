# soundcheck

One musical brief, played by several audio engines, so the stack for **Guest DJ** (Claude Founder House, Wed 23 Sept)
gets chosen by ear instead of by reading docs.

```
npm install
npm run dev        # http://localhost:5188
```

Press **1–5** to switch engine on the same reference track (Detroit techno, 130 BPM, F minor), **space** to stop.
Every pane is editable; **⌘/ctrl + enter** re-runs it. Reference tracks are level-matched to within a few dB so louder
doesn't win by default.

| Key | Engine | What to listen for |
|---|---|---|
| 1 | **Strudel** | Real TR-909 / Linn / MPC60 samples and sampled piano. Five genres, because this is the front-runner and the hosted sandbox could only play synths. |
| 2 | **Tone.js** | The same track built from synth objects. Then *FM bells + pad*: sound design Strudel's oscillators can't do. |
| 3 | **Faust** | The same track as one DSP expression, with a Moog ladder model and zita reverb. Then *Physical models*: simulated djembe, marimba and nylon string. |
| 4 | **Glicol** | The same track in a graph language that runs entirely inside one AudioWorklet. |
| 5 | **SuperCollider** | The same track rendered to WAV by the native engine and looped. Read-only in the page: edit `offline/supercollider/render.scd`, then `npm run render`. |

## Hearing native engines in the browser

Anything that can't run in a browser gets rendered to a file instead. `npm run render` runs `sclang` headless, which
turns the patterns into an OSC score and has `scsynth` write a WAV faster than realtime (no audio device, no window).
`scripts/loop-wav.mjs` then cuts bars 17–32 out of it, so the reverb tail from the previous bars is already ringing
at the loop point, and level-matches it. SuperCollider doesn't need installing: a copy unpacked into `.tools/`
(gitignored) works, which is how it was done here because Homebrew wanted `sudo xcodebuild -license accept`.

TidalCycles and Sonic Pi are both front-ends that drive SuperCollider, so engine 5 is what they sound like
underneath. Their files in `offline/` have still **not been run**.

**Read `DECISION.md` after listening**, not before.

## How it was checked

A headless Chromium played every track and measured the output: all ten produce signal, no console errors, every
sample bank loads. `npm run check:faust` compiles the Faust tracks offline and prints RMS/peak. None of that says
whether anything sounds *good*. That part needs ears, which is the point of the repo.

## Layout

```
src/engines/*.js    one file per engine: { tracks, play(code), stop(), analyser() }
src/faust/*.dsp     Faust sources (compiled in the browser by libfaust WASM)
src/main.js         shell: lazy-loads engines, one-at-a-time playback, meter
offline/            Tidal / SuperCollider / Sonic Pi / Orca, unverified
scripts/            faust offline check, libfaust copy step
```

Samples stream from GitHub on first play, so the first bar of a Strudel track can be missing a hit while files load.
For the venue, vendor the handful of samples actually used.
