# What to build Guest DJ on

Listen first (`npm run dev`, keys 1–4). Then this.

## What each option costs you

| | Sound ceiling | Can Claude write it per phrase? | Beat-locked visuals | Venue risk | Work before Wed |
|---|---|---|---|---|---|
| **A. Strudel, produced properly** | Medium. Samples are as good as the samples; synths and reverb are plain. | Yes. Shortest code per bar, and sundial already has the enum-and-template safety layer. | Yes, already built: `onTrigger` gives hit times ~100 ms early. | Low. Needs network for samples unless vendored. | None. This is the current plan. |
| **B. Strudel patterns + a Faust or Tone instrument rack** | High. Strudel keeps drums and sequencing; bass, stabs and the reverb bus come from Faust/Tone nodes triggered from `onTrigger`. | Yes. Claude still only writes Strudel; the rack is fixed code you wrote. | Yes, unchanged. | Low–medium. One more moving part, all in the browser. | 1–2 days. |
| **C. Strudel → SuperDirt over OSC** | Highest. SuperCollider does the audio. | Yes, unchanged. | Mostly. Same scheduler, but audio latency is now SC's, so the one latency constant needs re-tuning. | Medium–high. SuperCollider + a bridge process running on stage. | 1 day of setup, then untestable risk. |
| **D. Tone.js only** | High. | Poorly. ~5× the code per bar, and it's imperative JS, so the "model emits enums, one module writes source" safety pattern gets much bigger. | Yes (`Tone.Draw`). | Low. | Rewrite. No. |
| **E. Faust only** | Highest in a browser. | No. Sequencing in Faust is table lookups; Claude would get it wrong live. | No event stream to tap. | Low. | No. |
| **F. Glicol only** | Low–medium. Small node library. | Yes, easily. | No lookahead events. | Medium: one maintainer, no ready promise, no feedback delay. | No. |
| **G. TidalCycles / Sonic Pi / SC direct** | Highest. | Tidal yes; the others less so. | Hard: visuals move out of the browser's clock. | High. Native installs on the demo laptop. | No, not by Wednesday. |

## Recommendation

**A for Wednesday, with B as the upgrade if A sounds thin to you.**

The thing the room will judge is whether a generated guest sounds like a record, and most of that is production, not
engine: real drum-machine samples, a layered kick, a ducked pad, sends into delay and reverb, and gain staging. The
five Strudel tracks here are an attempt at that. If they sound good to you, the engine question is closed and the
week goes on the resident loop and the guests.

If the drums sound right but the **bass, stabs or reverb** sound cheap next to the Faust and Tone versions, that's
the signal for B, and it's cheap: keep every Strudel pattern, mute those voices in WebAudio, and trigger a fixed
Faust node from the same `onTrigger` tap the visuals already use (Faust nodes take sample-accurate `time` arguments,
so it stays locked). Claude's contract doesn't change.

C is the long-term answer if this becomes a real set after the event. It isn't a Wednesday answer.

## Things I couldn't judge

- **Whether any of it sounds nice.** Everything was verified for signal, levels and errors by a headless browser. I
  have not heard a note. Glicol and the Faust physical models in particular were written blind.
- **The offline engines.** Not installed here, so that code has never run.
- **Option B's latency.** Faust and Strudel would share an AudioContext, so it should be sample-tight, but it isn't
  built yet.

## If you want the ceiling in this A/B

`brew install --cask supercollider`, then `sclang` can render `offline/supercollider/detroit.scd` to a WAV without
opening the app. Drop that in as a fifth "engine" that just plays the file, and you can compare the browser options
against SuperCollider on the same brief.
