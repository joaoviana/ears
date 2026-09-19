# EARS: the terminal version

A live set where the human writes the code, SuperCollider makes the sound, and Claude reads measurements and proposes
one change at a time. Everything is a terminal program, so the whole show is one tmux window on a projector.

```
npm run ears:stage        # tmux: your $EDITOR on the left, EARS on the right
npm run ears              # just the TUI (edit tui/set/*.scd in any editor)
npm run ears -- --seed 4821   # replay a base you liked (the seed is shown top right)
npm run ears -- --keep    # continue the set that's on disk instead of rolling a new base
npm run ears -- --mute    # silent: the ears still measure, nothing reaches the speakers
npm run ears -- --manual  # DJs only speak when you press a
npm run ears -- --demo    # visuals only, fake pulse, no SuperCollider
```

## A different base every time

Each launch rolls a seed, and the seed picks a **style** first: detroit, dub techno, acid, electro, two-step,
minimal, progressive, halftime or house. The style decides how the six slots are rolled so they belong together:
tempo (118–150, by style), kick figure, hat feel and swing, what the bass does, a four-bar chord progression the bass
follows with `\ctranspose`, and a lead. Grooves turn around every fourth bar (`~x` takes a list of rows: A A A B),
the kick pumps the bass and pads through a sidechain bus (`\duck`), and patterns carry their own randomness
(`Pwhite`, `Prand`, `Pbrown`, `Pwrand`), so one seed never loops identically. **g** rolls a new base mid-set through
a build; it lands on the drop and the tempo follows. Whatever was in `tui/set/` is archived to `tui/sets/` first.
By convention d1 kick · d2 hats · d3 clap/perc · d4 bass · d5 chords · d6 lead, but any slot can hold anything.
Ten instruments: `\kick \hat \clap \bass \acid \stab \fm \pad \perc`, plus `\vox` once a DJ has the vocals skill.

## The live thing is the code

Each of the six slots has a 16-step lane lit by the hits that actually sounded (SuperCollider reports each event's exact beat,
so the lane is the pattern, not a guess). The slot is coloured by whoever wrote it: the seed, **you** (a file save),
or a DJ, with the bar it landed on. The tokens a change brought in glow white for 8 bars. Under each avatar:
how many rounds they offered, how many you took, and which slots are currently theirs. The report's band rows have
live meters.

**?** shows every key on screen. The ones you'll use most: **1 2 3** take an option (**! @ #** with a build) ·
**n** skip · **tab** next DJ · **t** tell · **d / D / s / x** bring in, pick, summon, retire a DJ · **g** new base ·
**f** stage mode · **l p c** look, palette, characters · **v** DJs speak · **q** quit.

The interface wears the active palette: two accents per palette over shared neutrals, so a transition recolours
the whole screen, not only the field. `pixels` (the default character mode) draws field looks with half-blocks:
each cell is two samples, foreground over background, so it reads as a real shader at twice the vertical resolution.

## DJs

A DJ is a markdown file in `tui/djs/`: frontmatter for the name, palette, look and face parts, then `# Style`,
`# Idioms`, `# Never`, `# Greeting`. It's deliberately the shape of a Claude Code skill. Several ship with the repo (`resident`, `detroit-130`, `dub-siren`, `acid-reflux`, and whoever you've summoned since). **s** then a description ("plays acid, a bit unhinged") has Claude write a
new one; it is saved, walks into the booth on the next bar, brings its own look and palette with a wipe, and says
its greeting. Up to three DJs share the booth and take turns (back to back): each round the active one offers two or
three options in their own voice, you take one or none, and the next DJ steps up. Faces are 16×16 pixel art drawn with half-blocks (`sprites.ts`): cat, dog, fox, owl, bear, rabbit, frog, robot,
alien, skull, with optional shades. A generated DJ picks a species and never draws. They nod on the kick, open their
mouths on the clap, and their headphones flash with the hats.

## The two loops

**Human loop.** Save `tui/set/d1.scd` … `d4.scd`. The TUI sends the file to sclang; the voice is a `Pdef` quantised to
4 beats, so it swaps on the next bar, never mid-phrase. Parse errors are reported without advancing the last acknowledged active source. Interpretation is not transactional; later runtime errors or partial side effects require inspection.

**Agent loop.** An `ears` synth sits on the master bus and streams level, five bands, spectral centroid and onsets 15
times a second. Every 2 bars that becomes a listening report: each number against `refs/detroit.json`, with one plain
word (thin, boomy, dull, harsh, bright, sparse…). The active DJ is asked for ideas 4 bars after a new base, 2 bars after a take and 1 after a skip: the report, the
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

## Skills: earned by the DJ, activated by you

A DJ starts with the basic vocabulary. As you take its ideas it **unlocks** skills (fills after 1 take, vocals
after 2, drops after 3); the glyph under its face blinks `k!`, and **k** activates it. Until then the DJ isn't told
the skill exists, and the host refuses any proposal that reaches for it. Activated skills are saved in the DJ's
markdown file (`skills: fills, vocals`), so they keep them next set.

- **⟲ fills**: the patch carries `FOR 1` (or 2): the host keeps it for that many bars, then restores the slot.
- **♪ vocals**: a new instrument, `\vox`. The DJ writes `~v.("machine soul")`; the host renders the phrase with
  macOS `say` in that DJ's voice, loads it into SuperCollider, and only then evaluates the slot. `chop`, `len` and
  `rate` patterns turn a phrase into a hook.
  `\note` pitches a chop in semitones (a Pseq of notes turns one word into a melody); `\voxpad` holds one
  syllable still with grains, pitched, as a chord if you like: the chopped, reverb-soaked vocal sound.
  **Real voices beat the robot:** press **R** and talk or sing for 4 seconds (the mix drops out while it records);
  it lands in `tui/samples/note-N.wav`, trimmed and normalised, and DJs with the vocals skill are told to build
  from it. Any WAV/AIFF/FLAC you drop into `tui/samples/` works the same way, by file name: `~v.("hey-you")`.
  First use: macOS asks to let your terminal use the microphone.
- **`\choir`** is a base instrument (no skill needed): a formant choir that morphs between vowels
  (`\vowel` 0 a · 1 e · 2 i · 3 o · 4 u). The progressive and halftime styles use it for their chords.
- **▲ drops**: the patch carries `WITH build` or `WITH wash`, and the change lands on the drop.

Same idea as takeover: a capability is a grant, it's on the wire (`unlock`, `grant`), and it's revocable by editing
one line of a markdown file.

## Takeover

Autonomy is something you grant, per DJ, mid-set. **o** gives the active DJ `auto`: when it offers ideas you get a
two-bar veto window (**n** vetoes), then the host takes one for it, rotating between its style, fix and bold
angles, and riding a build into the bold ones. **O** grants everyone: a back-to-back set that plays itself while
you stand there. **o** again takes control back. The DJ never gains a new ability; the host acts on its behalf, and
every such verdict is logged as `grant:auto`.

## Speed

A DJ's three angles (fix the report · push its style · one bold move) are asked **in parallel**, each answers with
a few lines of patch (`SET cutoff = 600`) instead of rewriting code, at low reasoning effort. The first idea is on
screen in about 3 seconds and they appear as they arrive (it was 6–20 s for anything at all). The host turns the
patch into code, shows it as a diff, and validates it. `EARS_MODEL` and `EARS_EFFORT` override the defaults.

## The wire (for demos)

**e** splits the field with a live log of every message: `observation`, `request`, `proposal`, `rejected`,
`verdict`, `applied`, `landed`, `grant`… with timings. The same stream is written to `tui/logs/latest.jsonl`;
`npm run ears:tail` follows it in another pane or on a second screen. It's the proof that nothing reaches the
speakers without passing validation and a verdict.

## The protocol, and outside agents

The messages above are the [EARS protocol](../../ears-protocol/SPEC.md), in its own repo. This TUI is its reference
host: it listens on `localhost:57400`, and anything that connects can watch the wire and send `proposal` and `note`
and nothing else. `ears-protocol/src/mcp.ts` bridges that to MCP, so a Claude Code session can sit in the booth:
it shows up as a robot marked `wire`, its ideas join the same option list, and they pass the same validator.

## Transitions

A DJ mixer sits across the whole mix in SuperCollider (`\djfx`: high-pass, low-pass, echo), and a transition rides it
from now until a bar line, then lets go on the downbeat under a crash:

- **build**: the high-pass sweeps up under a noise riser, the bass disappears, and it all comes back on the drop.
- **wash**: the low-pass closes while the echo takes over, then opens on the drop.
- **riser**: riser and crash only. A DJ walking in gets one automatically.

**g** (new base) rides a two-bar build or wash and the new base lands exactly on the drop, tempo change included.
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
  current options in a strip underneath. That's the projector layout.

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
`--demo` visuals only · `--logs` start with the wire open · `--full` start in stage mode · `--voice` DJs speak.
`EARS_MODEL` (default sonnet) · `EARS_EFFORT` (default low) · `EARS_ANGLES` (1–3 ideas per round) ·
for a second instance that won't touch the live one: `EARS_PORT`, `EARS_SC_PORT`, `EARS_BUS_PORT`, `EARS_SET`, `EARS_DJS`.

## Files

```
engine.scd    SynthDefs, guarded master chain, ears, scope, djfx transitions, vox, /eval, ~d, ~x, hit + bar announcements
engine.ts     spawns sclang, speaks OSC both ways, maps SuperCollider's logical clock to local time
report.ts     ears stream → listening report          audio.ts   real samples → FFT for the visuals
agent.ts      angles, patch format, validator, summon  patch.ts   parse a slot, apply a patch, describe the diff
skills.ts     fills / vocals / drops: unlock rules, gating, phrase rendering with `say`
djs.ts        DJs as markdown files                    sprites.ts pixel-art faces
seed.ts       nine styles → six slots                  ascii.ts   looks, palettes, pixel mode, wipes, banners
bus.ts        the wire: screen log, JSONL, localhost socket      evidence.ts revisions, receipts, before/after comparisons
app.tsx       the Ink screen                           tail.ts    `npm run ears:tail`
set/ djs/ refs/ logs/ sets/ vox/    your code · the roster · reference profile · wire logs · archived sets · rendered phrases
dev/          probes that boot a second, muted engine to measure things without touching a live set
```

## Checked / not checked

Checked, all with the output muted: engine boots headless, slots eval and hot-swap, broken code is refused while the
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
npm run summarize -- ../soundcheck/tui/logs/latest.jsonl session-handoff.md
```

Comparisons are explicitly observational: different musical time, stochastic patterns, mixer transitions, and
shared effect tails are confounds. Per-voice taps, controlled A/B rendering, and full event-pattern diffs remain
future work. See [the protocol specification](../../ears-protocol/SPEC.md#evidence-v1-capability).

```sh
npm run test:ears                        # pure evidence, clock, and TCP/log tests
npx tsx tui/dev/check-evidence.ts         # separate muted engine, random ports, no performer files
python3 tui/dev/check-host.py             # full TUI, TCP proposals, keyboard take, stale-edit regression
```

The integration check logs an intentionally invalid expression to exercise failure receipts; its expected
syntax error is not a test failure. It prints the retained test-log path. `EARS_TEST_LOG_DIR` overrides that path.

`EARS_ENGINE_DEBUG=1` includes full engine stdout in JSONL; stderr and process errors are always consumed and logged.
