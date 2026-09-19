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

Each launch rolls a seed and builds the four slots from it: tempo (120–138), key and scale, kick figure (four,
broken, euclidean, half-time), hat style, a bass or acid line drawn from the scale, and a fourth voice that might be
stabs, FM bells, a pad, tuned percussion or a clap. **g** rolls a new base mid-set; it lands on the next bar and the
tempo follows. Patterns carry their own randomness too (`Pwhite`, `Prand`, `Pbrown`, `Pwrand`), so one seed never
loops identically, and the DJs are told they can use it. Whatever was in `tui/set/` is archived to `tui/sets/` first.
Drums are written as step rows, `~x.("X---x---X---x-x-", 0.9)`, so the room can read them.
Nine instruments: `\kick \hat \clap \bass \acid \stab \fm \pad \perc`.

## The live thing is the code

Every slot has a 16-step lane lit by the hits that actually sounded (SuperCollider reports each event's exact beat,
so the lane is the pattern, not a guess). The slot is coloured by whoever wrote it: the seed, **you** (a file save),
or a DJ, with the bar it landed on. The tokens a change brought in glow white for 8 bars. Under each avatar:
how many rounds they offered, how many you took, and which slots are currently theirs. The report's band rows have
live meters.

Keys, booth: **1 2 3** take an option (**y** = 1) · **n** skip them all · **t** tell the active DJ something ·
**a** ask now · **s** summon a new DJ from a description · **d** bring in someone from the roster · **x** dismiss.
Keys, screen: **g** new base · **l / L** look · **p** palette · **c** characters · **f** fullscreen · **m** mute ·
**r** save what's playing as the reference · **q** quit.

## DJs

A DJ is a markdown file in `tui/djs/`: frontmatter for the name, palette, look and face parts, then `# Style`,
`# Idioms`, `# Never`, `# Greeting`. It's deliberately the shape of a Claude Code skill. Three ship with the repo
(`resident`, `detroit-130`, `dub-siren`). **s** then a description ("plays acid, a bit unhinged") has Claude write a
new one; it is saved, walks into the booth on the next bar, brings its own look and palette with a wipe, and says
its greeting. Up to three DJs share the booth and take turns (back to back): each round the active one offers two or
three options in their own voice, you take one or none, and the next DJ steps up. Faces are assembled from named
parts (hair, eyes, headphones, rig), so a generated DJ chooses parts and never draws. They nod on the kick.

## The two loops

**Human loop.** Save `tui/set/d1.scd` … `d4.scd`. The TUI sends the file to sclang; the voice is a `Pdef` quantised to
4 beats, so it swaps on the next bar, never mid-phrase. Broken code is rejected and the last good version keeps playing.

**Agent loop.** An `ears` synth sits on the master bus and streams level, five bands, spectral centroid and onsets 15
times a second. Every 2 bars that becomes a listening report: each number against `refs/detroit.json`, with one plain
word (thin, boomy, dull, harsh, bright, sparse…). Every 8 bars the report, the code, your last verdicts and any note
you typed go to Claude as the active DJ, which returns two or three options: a slot's replacement code, a sentence,
and the report line or style rule behind it. **1/2/3** writes that code into the slot file, which is the human loop again.
When any change lands, the visuals wipe to a new look and palette on that bar.

## What stops the agent touching the sound

- It runs as `claude -p` with `--tools ""`: no file access, no shell, no MCP. It can only return text. (Uses your
  Claude subscription; no API key.)
- The text must match a JSON schema, start with `~d.(\dN,`, stay inside the five instruments, and contain none of
  SuperCollider's escape hatches (`unixCmd`, `File`, `interpret`, `;`…). See `validate()` in `agent.ts`.
- Nothing calls `eval` on a suggestion. The only path to the engine is a file write, and the only thing that writes
  the file is the **y** key.

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

## Files

```
engine.scd    SynthDefs, master chain, ears, /eval, ~d, hit + bar announcements
engine.ts     spawns sclang, speaks OSC both ways
report.ts     ears stream → listening report
agent.ts      prompt, schema, validation, the claude -p call
ascii.ts      text-mode fields
app.tsx       the Ink screen
make-ref.ts   plays the full brief muted for 8 bars and saves it as the reference
set/          the performer's code      set.start/  what ears:reset restores
```

## Checked / not checked

Checked, all with the output muted: engine boots headless, slots eval and hot-swap, broken code is refused while the
music continues, measurements and hit times arrive, the report renders, Claude returns a valid suggestion in ~6 s,
**y** lands it, a typed note changes the next suggestion, quit leaves no scsynth behind.
Not checked: how it sounds through speakers, audio/visual latency by eye, the tmux stage script with a real editor.
