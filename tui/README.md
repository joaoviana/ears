# EARS: the terminal version

A live set where the human writes the code, SuperCollider makes the sound, and Claude reads measurements and proposes
one change at a time. Everything is a terminal program, so the whole show is one tmux window on a projector.

```
npm run ears:stage        # tmux: your $EDITOR on the left, EARS on the right
npm run ears              # just the TUI (edit tui/set/*.scd in any editor)
npm run ears -- --mute    # silent: the ears still measure, nothing reaches the speakers
npm run ears -- --manual  # the agent only speaks when you press a
npm run ears:reset        # put the starting set back
```

Keys: **y** take · **n** skip · **t** tell the agent something · **a** ask now · **l** look · **c** character ramp ·
**m** mute · **r** save what's playing as the reference · **q** quit.

## The two loops

**Human loop.** Save `tui/set/d1.scd` … `d4.scd`. The TUI sends the file to sclang; the voice is a `Pdef` quantised to
4 beats, so it swaps on the next bar, never mid-phrase. Broken code is rejected and the last good version keeps playing.

**Agent loop.** An `ears` synth sits on the master bus and streams level, five bands, spectral centroid and onsets 15
times a second. Every 2 bars that becomes a listening report: each number against `refs/detroit.json`, with one plain
word (thin, boomy, dull, harsh, bright, sparse…). Every 8 bars the report, the code, your last verdicts and any note
you typed go to Claude, which returns one slot's replacement code, a sentence, and the report line it acted on.
**y** writes that code into the slot file, which is the human loop again.

## What stops the agent touching the sound

- It runs as `claude -p` with `--tools ""`: no file access, no shell, no MCP. It can only return text. (Uses your
  Claude subscription; no API key.)
- The text must match a JSON schema, start with `~d.(\dN,`, stay inside the five instruments, and contain none of
  SuperCollider's escape hatches (`unixCmd`, `File`, `interpret`, `;`…). See `validate()` in `agent.ts`.
- Nothing calls `eval` on a suggestion. The only path to the engine is a file write, and the only thing that writes
  the file is the **y** key.

## The visuals

`ascii.ts` is a shader whose framebuffer is text: each look is a scalar field over (x, y, time, pulse) mapped onto a
character ramp. `pulse` carries `kick / snare / hat / stab` envelopes, the bar phase and the five bands. The engine
announces every hit 200 ms before it sounds (the server's scheduling latency), so the flash is fired on the hit
rather than after it. Looks are chosen by name, so the agent can pick one but never writes drawing code.
The banner is `figlet`.

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
