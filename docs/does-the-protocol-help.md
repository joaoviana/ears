# Does the protocol help?

Run 1, 19 September 2026. 4 seeds × 7 rounds × 3 conditions, 84 ideas, all graded, none refused.
Full data: [`bench/2026-09-19-23-13.md`](bench/2026-09-19-23-13.md).

## The setup

One DJ (THE RESIDENT), one idea per round, auto-taken, on a muted second engine. Each base is measured clean,
then deliberately broken: the kick buried, the hats 2.6× too loud, the low voice's filter 3.2× open. Two things
are measured every round:

- **Can it predict?** Every idea must call its shot (`EXPECT air down`). The host measures the change two bars
  later, against a noise floor learned from four windows of the unchanged music, and grades it HIT, MISS or FLAT.
- **Can it steer?** Distance from the clean base, in tolerances (1.5 dB per band, 0.15 octave of brightness,
  1 dB of level). 0 is "back where it started". Two windows of the *unchanged* base sit about 1.0 apart, so
  anything under ~1.0 is as close as this measurement can see.

| condition | what the DJ sees |
|---|---|
| **blind** | the code only |
| **ears** | the code + the listening report (the protocol's observation) |
| **ears+shots** | the above, plus its own graded record fed back into the next prompt |

## Result

| condition | ideas | predictions that came true | steering: distance start → end | ideas that moved it closer | s / idea |
|---|---|---|---|---|---|
| blind | 28 | **11%** (3 hit / 0 miss / 25 flat) | 2.85 → **0.97** | 57% | 5.9 |
| ears | 28 | **29%** (8 / 0 / 20) | 3.10 → 2.47 | 50% | 6.7 |
| ears + shots | 28 | **39%** (11 / 1 / 16) | 3.02 → **1.81** | 61% | 6.8 |

(Per-slot grading. Grading the same calls on the master mix gives 14% / 36% / 43%: the same ordering.)

### 1. The protocol makes an agent much better at knowing what its own changes do

11% → 29% → 39%, monotonic, and the two halves of the protocol each contribute: the measured report roughly
triples the hit rate over reasoning from code alone, and feeding the agent its own graded record adds another
third on top. This is the claim the showcase can make, and it is the thing the protocol is *for*: an agent that
cannot hear, told what it did, gets better at anticipating what it will do.

Note the column of zeros in the MISS count. Across 84 ideas there was exactly **one** case of the sound moving
opposite to the prediction. Almost every failure is FLAT: the agent moves the right thing, too little to measure.
It is timid, not wrong.

### 2. It did not steer better in this test, and the likely reason is my experimental design

Blind ended closest to the clean base (0.97 against 2.47 and 1.81). Two things look responsible, and the first
is a flaw:

- **The damage was visible in the source.** The breakage appended `* 2.6` and `* 3.2` to the code, so the "blind"
  condition could simply read what had been done and undo it. That is not blind, it is an answer key. Fixed for
  run 2: the damage is now folded into the numbers, so the code reads as a track somebody wrote badly.
- **The report caused fixation.** The `ears` DJ called `air` 15 times out of 28: loud hats are the loudest thing
  in the report, so it chased that one symptom round after round while the buried kick and the open filter stayed
  broken. Blind, with no report to chase, spread its attention (brightness 8, punch 5, high 4, sub 3, low 2) and
  fixed the actual damage. Feeding grades back partly cured this: `ears+shots` got the best steering of the two
  report conditions, because a FLAT told it to stop pushing on the same thing.

So this run does not show that the observation hurts. It shows that **one loud number in a report will monopolise
an agent's attention**, which is a real and fixable finding about how to write a report, not a verdict on the idea.

### 3. The predictions were often the wrong metric

Across run 1 the agent repeatedly made a good change and called the wrong measurement: restoring a buried kick and
predicting `punch up` when what moved was `sub` and `loudness`. The grade then says FLAT for a correct musical
decision. This is why the hit rate understates how well the agent was doing, and it is fixed for run 2: the DJ
prompt and `hello.capabilities` now carry a table of every metric with **what actually moves it**, so the agent
can look up its own change before naming a metric.

## What changed because of this run

1. The metric table with `moved_by` is now in the DJ's prompt and published by the protocol, so outside agents get
   the same help (`ears-protocol/src/profile.ts`, `tui/vocabulary.ts`).
2. The benchmark's damage is hidden from the source, so "blind" is genuinely blind.
3. Both are in run 2, which re-tests the steering question honestly.

## What this cannot tell you

Four seeds and one DJ. Grading is observational on a live mix; per-slot figures are a dry-slot contribution
estimate, not a controlled re-render. The engine ran at 24 kHz for part of the earlier work, which compresses the
`air` band. Everything was measured, nothing was heard. Read the prediction result as a real effect with a small
sample, and the steering result as a question the next run answers.
