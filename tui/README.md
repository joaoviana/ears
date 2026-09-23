# EARS: the terminal version

A live set where the human writes the code, SuperCollider makes the sound, and Claude reads measurements and proposes
one change at a time. Everything is a terminal program, so the whole show is one tmux window on a projector.

```
npm run ears:stage        # tmux: your $EDITOR on the left, EARS on the right
npm run ears              # just the TUI (edit tui/set/*.scd in any editor)
npm run ears -- --style ambient  # the new calm nature system (also the default)
npm run ears -- --seed 4821   # replay a base you liked (the seed is shown top right)
npm run ears -- --keep    # continue the set that's on disk instead of rolling a new base
npm run ears -- --mute    # silent: the ears still measure, nothing reaches the speakers
npm run ears -- --manual  # DJs only speak when you press a
npm run ears -- --demo    # visuals only, fake pulse, no SuperCollider
```

## Suggestions

Ambient rounds and typed directions show two composed choices immediately from a sixteen-gesture arsenal. They rotate across slowed
fingertips, rolling marbles, paper and brush grain clouds, rain prisms, wave memory, warm paper folds, submerged droplets, twig and reed cycles, leaf shuffles, warm glow, field recordings and replacing the low foundation. A third, source-aware
idea is composed by the current Sonnet model in the background, with a 45-second ceiling. No question blocks the
music. A newly added DJ starts this flow as soon as it enters the booth.

Club styles retain “Keep this groove or reshape it?” Answering does not apply a move: **y / 1** takes the resulting
proposal separately. Changes to source, tempo or key invalidate prepared answers. Jev can review an offered move in
the background and cannot delay it. A new typed brief, favourite direction, DJ, skill or mode cancels obsolete work.

Favourite development and club modes retain the **three-alternative** flow, normally groove, hook and left turn.
Ambient directions and power showcases keep the immediate pair while the model prepares an optional wildcard. Each
composer reads the current source, DJ persona, performer request and relevant evidence. The model chooses its
musical mechanism; the live prompt no longer assigns a rotating recipe. No instant row shifts, reversed melodies
or octave answers fill seats while a model is thinking. `--keep` continues the current files instead of loading the
ambient base.

**W** changes the musical briefs and permitted scope (tame still asks for repair). The default creative mode uses
medium effort. Composition gets 45 seconds per request, 60 for a favourite, with one bounded retry where applicable.
`EARS_DEADLINE` and `EARS_EFFORT` override these defaults. Valid ideas appear as they finish; a failed composer does
not erase the others. Taking/skipping, changing the brief or exiting cancels obsolete work.

Jev review is optional: export `JEV_API_KEY` and set `EARS_JEV_RANK=1`. Alternatively, `EARS_JEV_ENV_FILE` reads
only that key from a dotenv file without executing it. In the three-alternative flow, the first completed idea goes straight to review while
other composers continue. Further completions accumulate into the next review batch (at most three requests,
each bounded to 10 seconds). TypeSafe scores request fit and musical development from source. Confident candidates
may be reordered within an unpublished batch; uncertain ones retain their positions. Visible option numbers never
move. Progress shows composers finished, review activity and elapsed seconds. Errors leave the original composed options available. The wire logs review results
as notes, separate from measured prediction outcomes. Jev neither hears audio nor writes code or takes an option.
See [TypeSafe's API](https://docs.typesafe.ai/introduction/quickstart).

```sh
EARS_JEV_RANK=1 EARS_JEV_ENV_FILE=path/to/.env npm run ears -- --keep
```

An offline probe reads the current set and writes no musical source:

```sh
npx tsx tui/dev/probe-composed.ts
# Optional: reads only JEV_API_KEY from a dotenv file, without executing it or saving the credential.
npx tsx tui/dev/probe-composed.ts --jev-env /path/to/.env.development.local
```

## Hear A/B and keep a moment

`[` saves the last four seconds as A; `]` saves B. Press `\` to hear A then B, or Escape to return live.
`M` keeps the last four seconds as a favorite. `H` opens saved moments, including previous sessions; Enter opens
actions: replay, mutate its rhythm, answer its melody, or bring it back transformed.
The status row identifies replay. Mute still applies. Patterns continue underneath; meters keep describing the live
engine, and automatic takes pause during audition. This plays captured audio; it does not restore the set or effect state.

Choose a development action to make that favourite the musical reference for future DJ rounds. The footer shows the
active direction plus actual progress (elapsed seconds, ready ideas, or a failure reason); **J** clears it. **t** can refine the request. DJs borrow the saved patterns and adapt them to the
current key, tempo, instruments and unlocked skills. Choosing a reference neither restores old code nor plays audio;
proposals use the usual take / auto controls. A new reference invalidates existing suggestions and cached work. Favourite requests get 60 seconds per composer by default
(`EARS_DEADLINE` overrides). If no idea arrives, **a** retries; automatic mode waits four bars to retry.

This is **source-based development**, not audio motif extraction. The saved source may overlap a transition or differ
from the exact captured sound; prompts retain that uncertainty. Requests and proposals carry `inspiration_id`, and
`inspiration` log events record the chosen artifact, intent and source snapshot. Captures made while a direction is
active retain its ID as context, not proof that the audio derives from it. This direction lasts for the current
session until cleared; select the favourite again after restarting. Remote agents are not automatically steered by
this local DJ prompt.

Each capture writes a stereo WAV and JSON manifest under `tui/moments/` (override with `EARS_MOMENTS_DIR`). The manifest
contains source context, the preceding known state, events during the window, overlapping observation IDs, execution
IDs and a content hash. `M` also emits an explicit human `preference: keep`; taking a proposal does not imply liking it.
The protocol log records `audio_artifact`, `preference`, `audition` and capture failures; MCP `read_room` exposes recent
artifacts and preferences received while connected. Clips remain on the host; local paths are not remote downloads.

These are retrospective live comparisons, not controlled renders. Window timing is estimated, reports may overlap
without sharing exact boundaries, and randomness, phase and effect tails can differ. Audio is captured after the
master chain, before mute/volume. Demo mode has no audio to capture. Saved moments retain source as context; they do
not yet extract motifs or teach agents to recall them automatically.

Checks: `npm run test:ears`; `npm run ears:demo-check` exercises the projected ambient opening, first choices and powers in an isolated demo TUI. Optional real-engine probe on unused ports:
`EARS_PORT=57341 EARS_SC_PORT=57191 npx tsx tui/dev/probe-moments.ts` (muted, separate engine, approximately 36 seconds).

## The ambient base

Ambient is now the default: 64 BPM in D lydian. Its first twelve seconds are scored: water and close fingertips arrive immediately,
rain and the warm glow enter together at 1.88 seconds (the glow's own attack takes six to ten seconds, so it blooms under the rain), grain at 3.75, then the canopy at 11.25. The full system holds waves, slowed rain and occasional birds, plus a
moving granular brush current, slow D-lydian warmth and an asymmetric fingertip rhythm with a short woody contact knock. It starts with no
FM mote, permanent drone, kick, backbeat or bass riff.

**It is meant to be warm and mellow, and warmth is measured, not asserted.** `sh tui/dev/band-profile.sh clip.wav` reads
a render on the same bands the ears report; the shape wanted is body (200-600 Hz) fullest, sub well under it, top present
but smooth. Before this revision the base read *boomy* (sub 15 dB over body) and its sustained layer read as absent: the
fingertip contact body was a 38-58 Hz sine thump 25 dB louder than the waves, the brush cloud measured -55 dBFS, and the
arsenal's lows were 37-55 Hz sines with a pitch drop (the horror-cue shape). Those were fixed by measurement: the knock is
a warm-low woody body 9 dB down, the cloud plays nearer its own pitch and is audible, the waves lost their surf rumble and
gained 3 dB, the reverb's wet path is high-passed at 150 Hz, and every low gesture lives in the D2-A2 register. It is deliberately composed rather than reshuffled by the JavaScript seed; SuperCollider's stochastic patterns
create the living variation. Voices and choir are disabled here. The resident DJ protects silence, long envelopes and
the field recordings while replacing stale layers with fingertips, marbles, submerged droplets, wood, leaves, mist, canopy, air or open space.

The older bases remain available by name. **boogie** (112-118, swung hats, octave bass, FM organ stabs),
**italo** (124-130, four-on-the-floor, offbeat hats, snare backbeat, supersaw arp) and **piano house** (126-132,
pumping offbeat bass, 9th-voiced electric piano, choir pad). **Dark**: the techno family below. **Any**: everything,
including the styles retired from the rotation - nothing was deleted, they are still in `seed.ts`, and
`--style "balearic"` reaches one by name. **b** cycles the mood; `--mood dark` starts there.

The `\nature` instrument plays stereo field recordings as long, filtered, overlapping layers. Bundled public-domain
sources and transformations are recorded in `tui/samples/nature/SOURCES.md`: rain, birds and waves from Wikimedia
Commons, 48 kHz stereo, high-passed and faded, with no low-pass and no loudness normalization. Their Commons
originals are 44.1 kHz, so 48 kHz is the whole of what honestly exists; `waves.wav` has real air, `rain.wav` and
`birds.wav` have almost none and no processing will put any there. Replace those WAV files or use `~n.(\name)` to
add another environment.

The `\texture` instrument plays close object recordings through `~t.(\name)`. `fingertips.wav` is fingertip contact
and release on a wooden beam; `marbles.wav` is glass rolling across wood. `paper.wav` and `brush.wav` add close paper
fibres and pitched forest brush. All are CC0, processed to 48 kHz stereo with a high-pass, a 10 ms declick fade and
loudness normalization, and documented in `tui/samples/texture/SOURCES.md`. There is deliberately **no** low-pass:
an earlier preparation filtered all four at 10-11 kHz and the tactile detail went with it, so every bit of air in
the show had to be synthesised. `scripts/prepare-samples.sh` re-derives the whole library from its pinned sources,
and `docs/sample-audit.md` records what that recovered. Optional `sub` / `subfreq` arguments add a bounded, decaying contact body instead of a sustained bass voice.

`\glow` is the warm voice: a sine fundamental, a soft second harmonic and two barely detuned saws low-passed at a few
times the note (`warm`), with per-voice drift on its own slow clock and attacks measured in seconds. It takes chords as
`\midinote` arrays and the D-lydian voicings the base uses avoid the bare tritone; `breath` adds a little formant air,
`shine` a glimmering third and fourth partial, `swell` a slow breath on the held chord, and `saw` 0..1 runs it from a
warm sine glow to a wide, bright space organ (more saw, filter opened, an octave layer). The base keeps it present the
whole time on a chord cycle over a D pedal, and the arsenal offers it in four registers: **space organ tide** (the
full organ in d5), **star field** (quiet high chords in d3), **deep orbit** (a low saw pedal that arrives and leaves
in d4) and **saw dawn** (bright chords whose filter opens across a minute in d6). A note that mentions harmony, chords,
saws, synth or interstellar pulls those forward. Taking any of them brings a second glow voice in another register with
it (a low pedal under the organ, stars over a dawn): the chord is stacked across the room, and the card says so.

`\cloud` continuously granulates any nature or texture recording through `~g.(\name)`: grain position, pitch,
stereo placement and filter drift independently. Ambient selection excludes the porcelain resonator and pitched bell gestures.
The shared space uses tempo-related comb echoes followed by four slowly modulated diffusion stages. These are core
SuperCollider UGens; no Quark or C++ plugin is required. The design follows the official
[Pattern Guide](https://doc.sccode.org/Tutorials/A-Practical-Guide/PG_01_Introduction.html),
[GrainBuf](https://doc.sccode.org/Classes/GrainBuf.html), [Warp1](https://doc.sccode.org/Classes/Warp1.html),
[Pwalk](https://doc.sccode.org/Classes/Pwalk.html) and [Pfsm](https://doc.sccode.org/Classes/Pfsm.html) references.

The muted real-engine opening probe records twenty seconds and reports exact first-event times, four-second loudness,
headroom, centroid and five spectral bands: `npx tsx tui/dev/probe-ambient-opening.ts`.

Every gesture's called shot is **measured, not written**: `tui/dev/measure-expect.ts` lands each one over the base on a
muted engine and reads the changed slot's own tap before and after, and `tui/dev/derive-expect.py --write` sets each
gesture's `expect` to the metric it moves most against the grader's default floors (keeping the gesture's intent where
that clears the floor) and records the strength in `MEASURED`; gestures that clear the floor lead the rotation a little,
so a round is usually one the meter can check. In the ambient set the verdict uses the first clean report after the change, a move that
touches two slots is graded on its primary slot's own tap, and the next round is held until the taken idea's verdict
is in (capped at eight bars), so the idea that was taken stays the subject on screen through play, measure and verdict.
The LOOP panel in the offers pane is paced for a room: a taken idea's line flies from the cards to the panel over
0.7 s and the panel flashes as it lands; each step (idea, vet, write, play, measure, verdict) is shown for at least
1.2 s even though the host does vet and write in a millisecond; the judged idea holds the panel for eight seconds after
its verdict, and the next round waits three bars after it. Rerun both after
changing a gesture or an instrument.

Explicit recipe takes/skips and measured HIT/MISS/FLAT outcomes update a small per-DJ score. The score only reorders
the next eight structurally eligible recipes; it never writes source or bypasses validation. Memory persists locally
in ignored `tui/state/ambient-learning.json`. `round_start`, `curation` and `learning` events make every choice visible
on the wire and in `npm run ears:why`.

## Start from nothing and build it together

```
npm run ears -- --style opening
```

A kick and a sub, and **four empty slots**. The host lists them to every DJ as free (`agent.ts` computes which slots
are empty and says so in the prompt), the `add` angle goes hunting for them, and a proposal that fills one always
counts as new. So the track composes itself: you take an idea, a voice arrives, the report changes, the next DJ
answers what is now there. Nothing is scripted - the arc is whatever you take.

It is kept out of the random rotation so **g** can never roll it out from under you mid-set. `--style glitch` is the
same feeling with all six voices already in: sparse, off-grid, and built so the four-bar turnaround *accretes* - bar
one is nearly silent and a hit is added each bar, so the pattern itself is the build.

Each launch rolls a seed, and the seed picks a **style** first, from whichever mood is active (the dark family is
detroit, dub techno, acid, electro, two-step, minimal, progressive, halftime, house). The style decides how the six
slots are rolled so they belong together: tempo (112–150, by style), kick figure, hat feel and swing, what the bass does, a four-bar chord progression the bass
follows with `\ctranspose`, and a lead. Grooves turn around every fourth bar (`~x` takes a list of rows: A A A B),
the kick pumps the bass and pads through a sidechain bus (`\duck`), and patterns carry their own randomness
(`Pwhite`, `Prand`, `Pbrown`, `Pwrand`), so one seed never loops identically. **g** rolls a new base mid-set through
a wash; it lands under the filter and the tempo glides to the new value. Whatever was in `tui/set/` is archived to `tui/sets/` first.
By convention d1 kick · d2 hats · d3 clap/perc · d4 bass · d5 chords · d6 lead, but any slot can hold anything.
Instruments: `\nature \gendy \kick \hat \clap \bass \acid \stab \fm \pad \perc \snare \rim \sub \reese \pluck \choir \noise`, plus `\vox`
once a DJ has the vocals skill, and the two sampled ones the live rotation is built on: **`\smp`** (the 909 / LinnDrum
kit in `tui/samples/kit`, one voice per `\buf`, or a whole percussion row with `~kp.("--s-C--s-s--C-t-")`) and
**`\keys`** (a sampled piano in `tui/samples/keys`, pitched to the nearest recorded octave by `~kf` / `~kr`).
The archive styles stay on the synth drums: the benchmark measured those, and runs 1-4 have to stay reproducible.

## Three layouts, and the show

**f** walks three layouts. **show** is the default and the audience's view: the visuals take most of the screen, the
booth and its offers sit under them, and everything else appears only once the protocol has produced it. The
`ROOM` line arrives with the first listening report; **the protocol** pane arrives with your first verdict and draws
the SPEC's loop live (`state ▸ observe ▸ propose ▸ verdict ▸ applied ▸ evaluated ▸ active ▸ measured ▸ graded`, each
stage lit as its message lands for the idea in flight) over a running tally (proposed, refused by validation, taken,
calls hit) and the newest wire line; the `CALLED` row joins it with the first measured grade. A guide line under the
booth points at whatever just happened and says what it means in one sentence, keyed to the message itself: an idea
arriving explains called shots, a take explains the receipts, a grade explains that nobody prompted the correction, an
unlock explains that a capability is a grant. **G** hides it; `--no-guide` starts without it. **stage** is the field
plus a measured strip (the projector layout for a set that is already understood); **window** is everything at once,
for the performer (`--window` starts there, `--full` in stage). `tui/guide.ts` holds the reveals, the ribbon and the
captions as pure functions over the wire, so `tui/tests/guide.test.ts` can drive them without a terminal.

**S** opens the demo script beside the visuals: a teleprompter that follows the wire. Its top half is the four
components of the show, always on screen with their live state and one sentence to say about each: the picture
(which look, what it draws from), the sound (what is in the six slots), the listeners (who is in, taken/offered, checks
right and wrong, powers, acting alone, guest), the ideas on the table (instant or Claude Code), and the last check
(what the idea said it would do, what the meter showed, right or wrong, or why it could not be checked). The component
the newest event belongs to is lit. Under that it shows the beat the set is on
(an idea arrives, you took it, in the speakers, the call is graded, a listener earned a power, takeover, a guest on
the wire…), two or three sentences to say about the mechanism behind it that read the actual example on screen
(which option changes which slots, what it called, who wrote it), each tagged `[claude]`, `[sound]`,
`[supercollider]`, `[protocol]` or `[djs]`, the next thing to do with the key that does it, and the beats not yet
reached. The beat is chosen by the newest protocol message with something to say, never by a timer, so the words are
always about what is on screen. `--script` starts with it open. The beats live in `tui/script.ts`. Whatever the sidebar
would say is also written to the session log as a `script` message whenever it changes, open or not, so a transcript
reads back as the talk that went with it (`npm run ears:tail` shows it as `title · live sentence`); it is not shown on
the wire panes, and guests ignore it as an unknown type. In the show layout each card is one line, because the sidebar
now explains what the move does to the sound; the diff and evidence lines stay in the window layout.

## The live thing is the code

Each of the six slots has a 16-step lane lit by the hits that actually sounded (SuperCollider reports each event's exact beat,
so the lane is the pattern, not a guess). The slot is coloured by whoever wrote it: the seed, **you** (a file save),
or a DJ, with the bar it landed on. The tokens a change brought in glow white for 8 bars. Under each avatar:
how many rounds they offered, how many you took, and which slots are currently theirs. The report's band rows have
live meters.

**?** shows every key on screen. It takes the whole window and packs its groups into as many rows as the terminal is
wide enough for, so no description is ever cut in half; **esc** or **?** closes it. Ambient hides club-only voice notes
and manual builds. Its powers transform the
currently playing source: **k** performs an active power and **K** chooses one directly. The keys you'll use most: **1 2 3** take an option ·
**n** skip · **tab** next listener · **t** direct · **d / D / x** bring in, pick, retire a listener · **g** new base ·
**f** stage mode · **l p c** look, palette, characters · **v** DJs speak · **q** quit.

Whatever the host says back to you — a refused stack, an unlocked power, "engine is still booting", the stack-mode
hint — appears on its own `›` row at the foot of the offers pane, so it is never covered by the options it is about.
While a model composes, the spinner carries the elapsed seconds *and* a bar filling toward the composition ceiling
(45 s, 60 s for a favourite), because on a projector an unbounded wait and a hang look identical. When a DJ has
`auto`, the veto window is stated above the options as **AUTO takes one of these in N bars**, not only in the pane's
note.

**The booth band** sits across the bottom of the windowed layout and stays there, because on a projector a card that
has already expired is a card nobody saw. Four labelled rows, each composed only out of state that was really
measured or really written — a row with nothing true to say is not drawn rather than padded with something plausible:

- **NOW** — the tide phase the arsenal handed the composer (`ambientTide`), and which slots hold which instrument,
  with runs of the same instrument grouped (`d1 d2 d3 nature`). Outside ambient there is no tide, so it shows slots only.
- **BECAUSE** — the taken idea's own `EVIDENCE` line, then the measured facts behind it: two voices filling the same
  band at the same moments (`masking.ts`), a slot more than 6 dB from where the base started (`slotDrift`), and how
  many bars the room has stood still. Empty until something real is measured, which before the first report it is not.
- **CHANGED** — the edit that landed: the slots, what the DJ said it was for, where it is (submitted · next phrase ·
  in speakers · refused), and under it the keys the edit really moved, one per row (`delta Pseq([9, …]) → Pexprand(9, 17)`).
  Those come from `sourceDiff` in `evidence.ts` — the same per-key before/after the `applied` receipt puts on the wire,
  so the band and the log cannot disagree. Past six keys the change is a rewrite, and the patch's own sentence is shown
  instead of two keys out of twenty. A save from your own editor carries no patch, so it is diffed the same way and
  describes itself rather than reading "saved from editor".
- **CALLED** — the called shot: what was predicted, what was measured, and the grade, with `observed on the master
  mix` after it. The grade says the mix moved, never that this edit moved it — the same hedge the comparison's own
  `confounds` carry. It used to be a transient row above the options, which meant it expired while it was still the
  most interesting thing on screen; it now lives here and stays, dimming once its window has passed.

The band takes its rows from the field and never from the footer: the cap is what is left after the panes, the booth
and a minimum field, so the rows on screen always sum to the terminal's height. Its height is the most rows it has
needed since this base started, so a masking note that comes and goes with a report cannot resize the field every
two bars. As it runs out of room it drops the
changed-keys line first, then CALLED, then BECAUSE, then NOW — CHANGED is the last row standing. In `tight` mode
(under 42 rows) it keeps two rows, and when there is no room for a box at all it loses the border and keeps the
words. Stage mode carries the same three most important rows inside its measured strip. With `--manual` the band's
title says so, so a booth that is waiting for **a** never looks like a booth that is thinking.

The interface wears the active palette: two accents per palette over shared neutrals, so a transition recolours
the whole screen, not only the field. `pixels` (the default character mode) draws field looks with half-blocks:
each cell is two samples, foreground over background, so it reads as a real shader at twice the vertical resolution.

## DJs

A DJ is a markdown file in `tui/djs/`: frontmatter for the name, palette, look and face parts, a `signature` (the
arsenal gestures it reaches for first, so two listeners never offer the same set) and an `entrance` (the gesture it walks
in with: offered at once as its calling card and taken on its behalf after the two-bar veto window, logged as
`grant:entrance`; **n** vetoes it), then `# Style`, `# Idioms`, `# Never`, `# Greeting`. It's deliberately the shape of a Claude Code skill. Several ship with the repo (`resident`, `detroit-130`, `dub-siren`, `acid-reflux`, and whoever you've summoned since). **s** then a description ("plays acid, a bit unhinged") has Claude write a
new one; it is saved, walks into the booth on the next bar, brings its own look and palette with a wipe, and says
its greeting. Up to three DJs share the booth and take turns (back to back): each round the active one offers two or
three options in their own voice, you take one or none, and the next DJ steps up. Faces are 44×20 pixel portraits drawn with quadrant blocks, two by two pixels per character (`sprites.ts`): cat, dog, fox, wolf, owl, bear, rabbit, bat, moth,
frog, axolotl, robot, alien, skull, with optional shades. They are geometry, not bitmaps, lit from the top left with a
neon rim in the palette's second colour along every edge, and the active one sits in a halo that breathes with the kick. A generated DJ picks a species and never draws. They nod on the kick, open their
mouths on the clap, and their headphones flash with the hats.

## The two loops

**Human loop.** Save `tui/set/d1.scd` … `d4.scd`. The TUI sends the file to sclang; the voice is a `Pdef` quantised to
4 beats, so it swaps on the next bar, never mid-phrase. Parse errors are reported without advancing the last acknowledged active source. Interpretation is not transactional; later runtime errors or partial side effects require inspection.

**Agent loop.** An `ears` synth sits on the master bus and streams level, five bands, spectral centroid and onsets 15
times a second. Every 2 bars that becomes a listening report: each number against `refs/house.json`, with one plain
word (thin, boomy, dull, harsh, bright, sparse…). Ambient asks immediately after a new base, take, skip or DJ arrival;
club styles keep their slower turn spacing. The report, the
code, your last verdicts and any note you typed go to Claude, which answers with small patches (see Speed). **1/2/3**
writes the patched code into the slot file, which is the human loop again.
When any change lands, the visuals wipe to a new look and palette on that bar.

## What stops the agent touching the sound

Five places a DJ's text can be refused before it is sound:

1. **No tools.** It runs as `claude -p --tools ""`: no files, no shell, no MCP. It can only return text. (Uses your
   Claude subscription; no API key.)
2. **Patch form.** The text must parse as `SLOT / SET key = value / REMOVE / WHY / EVIDENCE` (plus `FOR`, `WITH`
   with the right skills). The host, not the model, writes the code from it.
3. **Validator** (`validate()` in `agent.ts`): the result must start `~d.(\dN,`, have balanced brackets, stay under
   600 characters, and contain none of SuperCollider's escape hatches (`unixCmd`, `File`, `interpret`, `;`, …). It is
   a deny-list: it does not check instrument or argument names. Duplicate options in a round are dropped.
4. **Grants.** A proposal that uses a skill the DJ hasn't been given is refused; a stale one (the slot changed since
   it was proposed) is refused at arrival and again at take.
5. **SuperCollider.** If the engine rejects the code, the last good version keeps playing and the slot shows the error.

Nothing calls `eval` on a proposal directly. Code reaches the engine by being written to a slot file, and the file is
written only by: your keypress (**1 2 3**, **! @ #**), the host acting under a grant you gave (`auto`), a fill
putting a slot back, or a new base.

## Called shots: a DJ has to say what will happen, and is graded on it

Every idea carries `EXPECT <metric> <up|down|same>` (sub, low, mid, high, air, brightness, loudness, density,
punch) or the host refuses it. The card shows the call (`calls air ↓`). When you take it, the call rides on the
`applied` receipt; two bars after the change is active the evidence layer produces a before/after comparison and
`shots.ts` grades it: **HIT**, **MISS**, **FLAT** (no detectable effect) or ungraded (no clean window). "Detectable"
is relative to a live noise floor: the patterns are stochastic, so the host measures how much each metric moves
between windows when nothing changed, and a call must clear twice that. The grade is pinned above the options,
kept per DJ (`calls 2/3` under the face), sent on the wire as `outcome`, and written into that DJ's next prompt
("you called brightness down; measured -41 Hz: FLAT, be bolder or pick a metric your change really moves").
It is observational, on the live master mix, and says so; it is not proof the edit caused the change.

The third option each round is a **left turn**: it must change that slot's instrument, rhythm or register, and
name what it contrasts with. A tweak is refused and asked again once.

## Ambient powers: earned by the listener, performed by you

A listener begins with **CARVE**. Taking its ideas unlocks **FRACTURE** after two and **REVEAL** after three; the glyph
under its face blinks `k!`, and **k** activates and immediately demonstrates it. **K** opens all three for a deliberate
demo at any time. Active powers are saved in the listener's markdown file.

- **◒ CARVE** applies moving high/low-pass, saturation and space to the current slot, regardless of its instrument.
- **⟲ FRACTURE** gives the current texture an asymmetric close-pair / long-gap rhythm for two bars, then restores it.
- **✦ REVEAL** exchanges or opens one colour through a slow wash and lands it on a phrase boundary.

Same idea as takeover: a capability is a grant, it's on the wire (`unlock`, `grant`), and it's revocable by editing
one line of a markdown file.

## Takeover

Autonomy is something you grant, per DJ, mid-set. **o** gives the active DJ `auto`: when it offers ideas you get a
two-bar veto window (**n** vetoes), then the host takes one for it, rotating between its style, fix and bold
angles, and riding a build into the bold ones. **O** grants everyone: a back-to-back set that plays itself while
you stand there. **o** again takes control back. The DJ never gains a new ability; the host acts on its behalf, and
every such verdict is logged as `grant:auto`.

## Composition latency

Ambient offers two authored, source-safe gestures immediately while the model composes a third source-aware move.
`EARS_MODEL` and `EARS_EFFORT` apply to every composer. `EARS_ANGLES` limits three-alternative rounds to 1–3 requests;
the question flow prepares two directions and cancels the unused one on answer.
`fast-round.ts` owns that ambient path; free-text requests, favourite development and club alternatives use
model composition. Every proposal still passes the same patch validator and revision guard.

Proposals identify `origin: recipe` or `origin: model`. Source revisions, verdicts, execution receipts and measured outcomes
remain independent of optional Jev source review.

## The wire (for demos)

**e** splits the field with a live log of every message: `observation`, `request`, `proposal`, `rejected`,
`verdict`, `applied`, `landed`, `grant`… with timings. The same stream is written to `tui/logs/latest.jsonl`;
`npm run ears:tail` follows it in another pane or on a second screen. It's the proof that nothing reaches the
speakers without passing validation and a verdict.

## The protocol, and outside agents

The messages above are the [EARS protocol](https://github.com/joaoviana/ears-protocol/blob/main/SPEC.md), in its own repo. This TUI is its reference
host: it listens on `localhost:57400`, and anything that connects can watch the wire and send `proposal` and `note`
and nothing else. `ears-protocol/src/mcp.ts` bridges that to MCP, so a Claude Code session can sit in the booth:
it shows up as a robot marked `wire`, its ideas join the same option list, and they pass the same validator.

## Transitions

A DJ mixer sits across the whole mix in SuperCollider (`\djfx`: high-pass, low-pass, echo), and a transition rides it
towards a bar-aligned handoff, then eases back to dry:

- **build**: the high-pass sweeps up under a noise riser, the bass disappears, and it all comes back on the drop.
- **wash**: the low-pass closes while the echo takes over, then gradually reopens. No added riser/crash; echo tails continue through the return to dry.
- **riser**: riser and crash only. A DJ walking into a club style gets one automatically; ambient arrivals stay dry.

**g** (new base) approaches the handoff over four bars of wash, swaps the patterns at the bar boundary, then reopens
over four bars. Tempo glides to the new base over four bars. This is a filter/echo-masked swap, not two complete decks
crossfading. **w** uses the same long wash. Starting a new ride cancels any older pending base-switch timer.
**! @ #** (shift 1 2 3) take an option *with* a build, so the change arrives as a drop instead of just appearing.
**u** and **w** fire a build or a wash by hand. The header shows the ride's progress.
To add one: a new `case` in the `/transition` OSCdef in `engine.scd` (what to do to `~djfx` as `f` goes 0→1), and
its name in `engine.ts`.

## Packages doing the work

- **ink** renders the screen; **@inkjs/ui** provides the text input (tell, summon), the roster picker (**D**, arrows
  and enter) and the spinners, themed to the active palette.
- **asciichart** draws the trend in the ears pane: loudness and brightness per report, with a ▴ in the author's
  colour wherever a change landed, so you can see what each take did to the mix.
- **cfonts** sets the name-in-lights banners. Each DJ keeps one of six fonts; narrower ones are tried if it won't fit.
- **gradient-string** colours the logo and pane titles between the palette's two accents; banners use the same
  gradient per column.
- **figlet** is no longer used for banners; **chokidar** watches the set folder; **osc-min** speaks OSC.

## Show moments

- A DJ walking in, or a new seed, puts their name across the field in block letters that assemble out of static and
  dissolve back into it, in their colour, while the scene wipes to their look.
- Four wipe styles, picked at random per change: `iris`, `blinds`, `sweep`, `shatter`.
- **f** is stage mode: the field fills the screen, with the six lanes and code lines, the booth line-up and the
  current options in a strip underneath — one option per line, each carrying the same move verb, slots and called
  shot as the windowed card (`ARRANGE d4+d5 · calls low ↑`). The strip is measured, so the field stops exactly above
  it and the footer keeps its row; the footer swaps to the round's own keys (**1 2 3** take, **n**, **t**, **a**),
  which in the windowed layout live in the pane notes. That's the projector layout.

## The visuals

`ascii.ts` is a shader whose framebuffer is text. Every cell gets its own 24-bit colour from a cosine palette. Three
kinds of look:

- **field** looks run a function per cell like a fragment shader. `gyroid` raymarches a gyroid lattice with a tunnel
  bored through it; `torus` is a lit, raymarched torus that turns once per bar and swells on the kick; `warp` is
  three nested passes of fractal noise; `moire` is ring interference with kaleidoscope folds that add one every 8 bars.
- **braille** looks draw lines on a dot canvas with 2×4 dots per cell, so 8× the grid's resolution. `orbit` is the
  real master bus in phase space (the signal against itself a few ms later: a bass note is an ellipse, harmonics knot
  it, silence is a dot); `ring` wraps the live waveform into a circle around an FFT burst; `terrain` is an outrun
  horizon whose mountains are the live spectrum; `wire` is two counter-rotating icosahedra with snare shock rings.
- The audio is real: SuperCollider writes the master bus into a ring buffer, the TUI fetches 43 ms of it 20 times a
  second and runs its own FFT (`audio.ts`). `orbit`, `ring`, `terrain` and `waterfall` draw that, not envelopes.
- **glyph** looks: `codefield` tiles your live code across the screen and lights it with a plasma, with a shockwave
  leaving the centre on every kick. `waterfall` is a scrolling spectrogram, the listening report as a picture.

`pulse` carries `kick / snare / hat / stab` envelopes, bar phase, bar number and the five bands. The engine announces
every hit 200 ms before it sounds, so the flash fires on the hit. Looks and palettes are chosen by name, so the agent
can pick one but never writes drawing code.

Keys: **l / L** next / previous look · **p** palette · **c** character ramp · **f** fullscreen field.
`npm run ears -- --demo` runs the visuals with a fake pulse and no sound engine.
`npx tsx tui/preview-html.ts` writes every look to `/tmp/looks.html` for checking colours outside a terminal.

## Flags and environment

`--seed N` replay a base · `--keep` continue the set on disk · `--mute` · `--manual` DJs only think on **a** ·
`--demo` visuals only · `--logs` start with the wire open · `--full` start in stage mode · `--window` start in the
performer's layout · `--no-guide` show layout without the guide line · `--voice` DJs speak.
`EARS_MODEL` (default sonnet) · `EARS_EFFORT` (default medium in the creative mode) · `EARS_ANGLES` (1–3 ideas per round) ·
`EARS_CONVERSATION=0` disables the immediate direction question ·
for a second instance that won't touch the live one: `EARS_PORT`, `EARS_SC_PORT`, `EARS_BUS_PORT`, `EARS_SET`, `EARS_DJS`.

If the interpreter dies under a live set, the host logs its last forty lines of output (an `engine_log` with
`engine exited … last lines:`), quits the server it left behind, relaunches it, and once it is ready again puts the six
slot files back and restores the tempo; the offers pane says so. It gives up after three deaths in one session.

SuperCollider is resolved asynchronously from `EARS_SCLANG` (an explicit executable path), then PATH, then known
macOS/Windows installation locations. An occupied audio port reports an error instead of killing another server.
Choose a free `EARS_SC_PORT` or stop the owning session. Optional greeting speech and microphone capture still use
macOS facilities; `say` discovery does not block startup. No custom C++ build is needed.

Run `npm run typecheck:ears` for the strict live-TUI type check and `npm run test:ears` for behavioral tests.

## Files

```
engine.scd    SynthDefs, guarded master chain, ears, scope, djfx transitions, vox, /eval, ~d, ~x, hit + bar announcements
engine.ts     spawns sclang, speaks OSC both ways, maps SuperCollider's logical clock to local time
report.ts     ears stream → listening report          audio.ts   real samples → FFT for the visuals
agent.ts      angles, patch format, validator, summon  patch.ts   parse a slot, apply a patch, describe the diff
skills.ts     carve / fracture / reveal: ambient power unlocks and gating
djs.ts        DJs as markdown files                    sprites.ts pixel-art faces
seed.ts       nine styles → six slots                  ascii.ts   looks, palettes, pixel mode, wipes, banners
bus.ts        the wire: screen log, JSONL, localhost socket      evidence.ts revisions, receipts, before/after comparisons
app.tsx       presentation only                        tail.ts    `npm run ears:tail`
use-performance.ts  performer actions, React state and visual timing
flags.ts      command-line switches and the seed        paint.ts   truecolor, text shades, name-in-lights banner
aim.ts        which voice each angle aims at, quiet line  staleness.ts which touched slots moved under an idea
conversation.ts     immediate direction questions and cancellable model preparation
session.ts    source I/O, watcher ownership, admission, execution receipts and lifecycle
remote.ts     validates untrusted guest proposals      live-grading.ts calibration and linked outcomes
platform.ts   executable discovery, optional speech    osc-reader.ts checked telemetry values
suggestion-round.ts model-only composition            jev.ts optional source-based ranking
set/ djs/ refs/ logs/ sets/ vox/    your code · the roster · reference profile · wire logs · archived sets · rendered phrases
dev/          probes that boot a second, muted engine to measure things without touching a live set
```

## Checked / not checked

Historical muted engine checks (not rerun by the latest refactor): engine boots headless, slots eval and hot-swap, broken code is refused while the
music continues, measurements and hit times arrive, the report renders, the first idea arrives in ~3–5 s (all three by ~6–13 s), a take lands it, a typed note changes the next suggestion, quit leaves no scsynth behind.
Not checked: how it sounds through speakers, audio/visual latency by eye, the tmux stage script with a real editor.


## Revision checks, sound evidence, and Claude handoff

Every session now has a UUID and ordered JSONL events. Source revisions guard against stale proposals at both
admission and take. Execution IDs connect the proposal, exact source diff, evaluation, scheduling, activation,
and measured before/after report. `active` is a pattern receipt, including rests/stops, not an audible-success
claim. Replacing an in-flight edit marks it superseded.

The analyzer remains the existing master tap, before volume. Wire metric names are now `envelope_dbfs`,
`peak_to_envelope_db`, `centroid_hz`, `onsets_per_beat`, and `bands_dbfs`. Legacy reference files still work.
`same_summary` only says the labels match. Numerical changes are always retained.

Set `EARS_LOG_DIR` to choose where logs go; the default remains `tui/logs/`. Filenames include the session ID,
and `latest.jsonl` points to the current session. To produce a file for another Claude session:

```sh
cd ../ears-protocol
npm run summarize -- ../ears/tui/logs/latest.jsonl session-handoff.md
```

Comparisons are explicitly observational: different musical time, stochastic patterns, mixer transitions, and
shared effect tails are confounds. Per-voice taps, controlled A/B rendering, and full event-pattern diffs remain
future work. See [the protocol specification](https://github.com/joaoviana/ears-protocol/blob/main/SPEC.md#evidence-v1-capability).

```sh
npm run test:ears                        # pure evidence, clock, and TCP/log tests
npx tsx tui/dev/check-evidence.ts         # separate muted engine, random ports, no performer files
python3 tui/dev/check-host.py             # full TUI, TCP proposals, keyboard take, stale-edit regression
```

The integration check logs an intentionally invalid expression to exercise failure receipts; its expected
syntax error is not a test failure. It prints the retained test-log path. `EARS_TEST_LOG_DIR` overrides that path.

`EARS_ENGINE_DEBUG=1` includes full engine stdout in JSONL; stderr and process errors are always consumed and logged.
