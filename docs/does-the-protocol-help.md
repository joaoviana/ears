# Does the protocol help?

Two runs, 19-20 September 2026. 4 seeds × 7 rounds × 3 conditions each, 168 ideas, all graded, none refused.
Run 1 exposed two flaws (below); run 2 is the same experiment with both fixed, and is the one to read.

## The answer, in one line

**Yes for prediction, not yet for repair.** The protocol roughly triples an agent's ability to say what its own
change will do (18% → 32% → 43%, and 21% → 32% → 57% graded on the master mix). It did not make the agent better
at restoring a broken mix, and the reason looks like a property of the report, not of the idea.

## The setup

One DJ (THE RESIDENT), one idea per round, auto-taken, on a muted second engine. Each base is measured clean, then
deliberately broken: the kick buried, the hats 2.6× too loud, the low voice's filter 3.2× open, with the damage
folded into the numbers so the source is not an answer key. Two things are measured:

- **Can it predict?** Every idea must call its shot (`EXPECT air down`). The host measures the change two bars
  later against a noise floor learned from four windows of the unchanged music, and grades HIT, MISS or FLAT.
- **Can it steer?** Distance from the clean base, in tolerances (1.5 dB per band, 0.15 octave of brightness, 1 dB
  of level). Two windows of the *unchanged* base sit about 1.0 apart, so anything near 1.0 is as close as this
  measurement can see.

| condition | what the DJ sees |
|---|---|
| **blind** | the code only |
| **ears** | the code + the listening report (the protocol's observation) |
| **ears+shots** | the above, plus its own graded record fed back into the next prompt |

## Run 2, the corrected experiment

| condition | ideas | predictions that came true | graded on the master | steering: start → end | best reached | moved it closer |
|---|---|---|---|---|---|---|
| blind | 28 | **18%** (5 hit / 0 miss / 23 flat) | 21% | 3.09 → 1.25 | **0.93** | 57% |
| ears | 28 | **32%** (9 / 0 / 19) | 32% | 2.82 → 1.81 | 1.57 | 54% |
| ears + shots | 28 | **43%** (12 / 0 / 16) | **57%** | 2.68 → 1.87 | 1.35 | 61% |

### 1. The protocol makes an agent much better at knowing what its own changes do

18% → 32% → 43%, monotonic, and both halves contribute: the measured report nearly doubles the hit rate over
reasoning from code alone, and feeding the agent its own graded record adds another third on top. Graded on the
master mix the spread is wider still, 21% → 57%. Run 1 showed the same ordering from a lower base (11 → 29 → 39)
before the metric table was added, so the effect has now been reproduced twice with different prompts.

This is what the protocol is *for*: an agent that cannot hear, told what it did, gets better at anticipating what
it will do.

**Almost nothing is a MISS.** Across 168 ideas in both runs there was exactly one case of the sound moving
opposite to the prediction. Nearly every failure is FLAT: the agent moves the right thing, too little to measure.
It is timid, not wrong. That is a much better problem to have, and it argues for asking agents to make bigger
moves rather than more careful ones.

### 2. It still did not steer better, and the reason is the report, not the protocol

Blind reached 0.93 from the clean base; the two report conditions reached 1.57 and 1.35. Feeding grades back helps
(1.35 beats 1.57, and it moved the mix closer more often, 61% of ideas), but neither beats having no report.

The metric histogram says why. The `ears` DJ called `air` 11 times out of 28 and `high` 4 more: loud hats are the
loudest thing in the report, so it chased that symptom round after round while the buried kick and the wide-open
filter stayed broken. The blind DJ, with nothing to chase, spread its attention (`sub` 9, `mid` 5,
`brightness` 5, `high` 4) and fixed the actual damage. Feeding grades back partly cures this, because a FLAT tells
the agent to stop pushing the same thing.

**One loud number in a report will monopolise an agent's attention.** That is a finding about how to write an
observation, and it is fixable: rank the problems by how far each is from the target and say which to fix first,
instead of presenting nine numbers of equal weight. That is the next experiment, and it is a change to the report,
not to the protocol.

## What run 1 got wrong, and what changed

### 3. The predictions were often the wrong metric (fixed between runs)

In run 1 the agent repeatedly made a good change and named the wrong measurement: restoring a buried kick and
predicting `punch up` when what moved was `sub` and `loudness`. The grade then said FLAT for a correct musical
decision. The DJ prompt and `hello.capabilities` now carry a table of every metric with **what actually moves it**,
and every condition's hit rate rose between the runs (11→18, 29→32, 39→43).

### 4. "Blind" was not blind (fixed between runs)

Run 1 applied the damage by appending `* 2.6` and `* 3.2` to the code, so the code-only condition could read what
had been done and undo it. Folding the damage into the numbers cost blind some of its advantage in steering
(0.69 → 0.93 best distance) and raised its prediction rate, which is what a fairer test should do.

## What changed because of these runs

1. The metric table with `moved_by` is now in the DJ's prompt and published by the protocol, so outside agents get
   the same help (`ears-protocol/src/profile.ts`, `tui/vocabulary.ts`).
2. The benchmark's damage is hidden from the source, so "blind" is genuinely blind.
3. Both were in run 2, which is the table above.
4. Next: rank the report's problems instead of listing them flat, and re-test steering. The fixation is the one
   thing standing between this protocol and an agent that repairs a mix better than one reasoning from code.

## What this cannot tell you

Four seeds and one DJ per run. Grading is observational on a live mix; per-slot figures are a dry-slot contribution
estimate, not a controlled re-render. The engine ran at 24 kHz for part of the earlier work, which compresses the
`air` band. Everything was measured, nothing was heard. Read the prediction result as a real effect,
reproduced twice with a small sample, and the steering result as a report-design problem with a named next step.

## Data

- Run 2 (corrected): [`bench/2026-09-19-23-49.md`](bench/2026-09-19-23-49.md)
- Run 1 (flawed, kept for the record): [`bench/2026-09-19-23-13.md`](bench/2026-09-19-23-13.md)
- Re-run either with `npm run ears:bench -- <seeds> <rounds>`; it always uses its own muted engine.
