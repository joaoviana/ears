# Does the protocol help?

Four runs, 19–20 September 2026. 4 seeds × 7 rounds × 3 or 4 conditions, **392 graded ideas**, none refused.
Each run fixed something the previous one exposed. Run 4 is the one to read; the others are why it says what it says.

## The answer, in one line

**Yes, and the biggest single gain came from something neither protocol specifies: the *order* of the report.**
Reasoning from code alone, an agent is right about what its own change will do 20% of the time. Given the
measurements ranked worst-first, told which voice drifted and which two voices are fighting, and told how big a
move has to be before the instruments can see it, it is right 46% of the time (p = 0.003) — and for the first
time it also repairs a broken mix better than the code-only agent.

## The setup

One DJ (THE RESIDENT), one idea per round, auto-taken, on a muted second engine. Each base is measured clean —
that measurement is the target — then deliberately broken: the kick buried, the hats 2.6× too loud, the low
voice's filter 3.2× open, with the damage folded into the numbers so the source is not an answer key. Two
questions:

- **Can it predict?** Every idea must call its shot (`EXPECT air down`). The host measures the change two bars
  later against a noise floor learned from four windows of the unchanged music, and grades HIT, MISS or FLAT.
  Graded twice: on the edited slot's own tap, and on the whole master mix.
- **Can it steer?** Distance from the clean base, in tolerances (1.5 dB per band, 0.15 octave of brightness, 1 dB
  of level). Two windows of the *unchanged* base sit about 1.1 apart, so anything near 1.1 is as close as this
  measurement can see.

| condition | what the DJ sees |
|---|---|
| **blind** | the code only |
| **ears** | the code + the listening report, flat: twelve measurements of equal weight |
| **ears+shots** | the above, plus its own graded record fed back into the next prompt |
| **brief+shots** | the same measurements, **ranked** worst-first, with per-voice drift, masking, the measured noise floor, and what has already failed |

## Run 4, the one with everything live

| condition | ideas | predicted right, per-slot | on the master | steering: start → best | moved it closer | s/idea |
|---|---|---|---|---|---|---|
| blind | 28 | 18% (5 / 0 / 23) | 25% (7 / **3** / 18) | 3.23 → 1.05 | 64% | 3.7 |
| ears | 28 | 29% (8 / 1 / 19) | 50% (14 / 0 / 14) | 2.93 → 1.18 | 75% | 5.4 |
| ears + shots | 28 | 39% (11 / 0 / 17) | 54% (15 / 0 / 13) | 2.81 → 1.20 | 46% | 5.6 |
| **brief + shots** | 28 | **46%** (13 / 0 / 15) | **61%** (17 / 0 / 11) | 2.86 → **0.94** | 64% | **4.5** |

Pooled over the two runs in which all four conditions ran head to head (n = 56 per cell):
blind 20%, ears 29%, ears+shots 36%, brief+shots 46%.
blind vs brief+shots **z = 3.01, p = 0.003**. blind vs ears+shots p = 0.057. ears+shots vs brief+shots p = 0.25 —
the last step is real in every run but not separable on this sample.

## 1. The protocol makes an agent much better at knowing what its own changes do

20% → 29% → 36% → 46%, monotonic, and each half contributes: the measured report lifts it over reasoning from
code alone, feeding the agent its own graded record adds more, and rewriting the report adds the most. Graded on
the master mix the run-4 spread is wider still, 25% → 61%.

This is what the protocol is *for*: an agent that cannot hear, told what it did, gets better at anticipating what
it will do.

## 2. Agents are timid, not wrong

Across all 392 ideas there were **2** cases of the sound moving opposite to the prediction on the per-slot
grader (6 on the master, 5 of those from the blind condition). 269 were FLAT: the agent moved the right thing,
too little to measure. That is a much better problem to have, and the fix is a number, not an adjective — the
report now states the measured floor in the units the call will be graded in ("a change to air smaller than
2.0 dB cannot be measured") and tells the agent to make a move big enough to see.

**The one thing they get backwards is brightness.** Seven of the eight MISSes in four runs were a call of
`brightness down` or `high down`: closing a filter reliably darkens *that voice* and just as reliably fails to
darken *the mix*, because the other five voices did not move. Exactly the error a whole-mix analyser cannot
catch, and the reason every slot now has its own tap.

## 3. A flat report is a trap, and ranking it is worth more than any message format

Given twelve numbers of equal weight the DJ called `air` **11 times out of 28**: loud hats are the loudest thing
in the report, so it chased that symptom round after round while the buried kick stayed buried. The blind DJ,
with nothing to chase, spread its attention and fixed the actual damage — which is why for three runs *blind
steered better than the protocol did*.

Ranking the same measurements moved the top call to `loudness` (12 of 28), which is where the damage actually
lived, and produced both the best prediction rate and the best repair (0.94, against blind's 1.05). Ranking does
not spread an agent's attention; it redirects it.

Five things a flat table cannot say, all of them now in `brief.ts`:

1. **which problem to fix first** — clipping outranks a band, a band outranks a colour
2. **which voice drifted**, from the per-slot taps, against how this base sounded when it started
3. **which two voices are fighting for one band at the same moments** — what "muddy" and "boxy" actually are
4. **how big a move has to be** to register at all
5. **what this agent has already tried that did not work** — the cure for fixation

## What each run fixed

| run | what changed before it | blind | ears | +shots | brief |
|---|---|---|---|---|---|
| 1 | First attempt. Damage appended to the source as `* 2.6`, so "blind" could read the answer. | 11% | 29% | 39% | – |
| 2 | Damage folded into the numbers; DJ prompt gained the metric table with `moved_by`. | 18% | 32% | 43% | – |
| 3 | The ranked brief added as a fourth condition. | 21% | 29% | 32% | **46%** |
| 4 | Masking, stereo width, groove and headroom added to what the host can measure. | 18% | 29% | 39% | **46%** |

Two flaws found and fixed between runs 1 and 2:

- **The predictions named the wrong metric.** The agent would restore a buried kick and predict `punch up` when
  what moved was `sub` and `loudness`. The DJ prompt and `hello.capabilities` now carry a table of every metric
  with **what actually moves it**, and every condition's hit rate rose.
- **"Blind" was not blind.** Folding the damage into the numbers cost blind some of its steering advantage
  (0.69 → 0.93 best distance) and raised its prediction rate, which is what a fairer test should do.

## What changed in the code because of these runs

1. The metric table with `moved_by` is in the DJ's prompt and published by the protocol, so outside agents get
   the same help (`ears-protocol/src/profile.ts`, `tui/vocabulary.ts`).
2. Per-slot taps: six buses, six analysers, grading on the edited voice's own measurement with its own noise
   floor (`engine.scd`, `tui/slotears.ts`).
3. The ranked brief replaced the flat report in the live app, not only in the benchmark (`tui/brief.ts`,
   `tui/app.tsx`).
4. Four new observation categories the benchmark asked for: masking, stereo width, groove and headroom measured
   before the limiter (`tui/masking.ts`, `tui/report.ts`).
5. Noise floors need four baseline pairs before they are trusted; below that the report says it is not
   calibrated instead of silently using a default (`tui/shots.ts`).

## What this cannot tell you

Four seeds and one DJ per run, 28 ideas per cell: read the ordering, not the decimals. Grading is observational
on a live mix; per-slot figures are a dry-slot contribution estimate, not a controlled re-render. `density` and
`punch` have no per-slot measurement and fall back to the master. The engine ran at 24 kHz for part of the
earlier work, which compresses the `air` band; everything quoted here is from 48 kHz runs. Everything was
measured, nothing was heard.

## Data

- Run 4: [`bench/2026-09-20-10-26.md`](bench/2026-09-20-10-26.md) · every round: `bench/2026-09-20-09-42.rounds.jsonl`
- Run 3: [`bench/2026-09-20-00-39.md`](bench/2026-09-20-00-39.md)
- Run 2: [`bench/2026-09-19-23-49.md`](bench/2026-09-19-23-49.md)
- Run 1 (flawed, kept for the record): [`bench/2026-09-19-23-13.md`](bench/2026-09-19-23-13.md)
- Re-run with `npm run ears:bench -- <seeds> <rounds>`; it always uses its own muted engine.
- One report printed both ways, from a muted engine: `npx tsx tui/dev/one-brief.ts <seed>`.
