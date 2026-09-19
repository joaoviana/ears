# Known issues and deferred work

Filed as they were found, newest first. Each entry says what is wrong, why it was deferred, and what fixing it
would take. Nothing here is a blocker for a three-minute showcase; everything here would matter for a claim.

## Grading and evidence

**Called shots often predict the wrong metric.** Seen in every benchmark run so far: a DJ brings a buried kick
back, calls `punch up`, and the measurement says FLAT because what actually moved was `sub` and `loudness`. The
change was good (the mix moved back toward the clean base) but the call was wrong, so the grade punishes a correct
musical decision. This is a prompt problem, not a measurement problem: the metric vocabulary is not grounded in
what each instrument parameter really does. Fix: give the DJ a short table of "this parameter moves that metric"
(kick amp → sub + loudness; hat dec/hp → air + brightness; bass cutoff → brightness + mid), and let it call two
metrics rather than one. ~2 h. Until then, read the distance-to-target column, not the hit rate, as the measure of
whether a DJ is steering well.

**Density and punch have no per-slot measurement.** `slotears.ts` measures level, five bands and brightness per
slot, but onsets and crest are only computed on the master. Calls on those two metrics are still graded master-wide
even when the slot is known. Fix: add an onset detector and a peak follower per slot tap in `engine.scd`. ~1 h.

**The per-slot grade is an estimate, not a controlled render.** The dry mix is recomputed from each slot's own
summary with the edited slot's after-measurement substituted in. The edited voice still varies with its own
randomness, and shared effects and the master chain sit outside those dry summaries. A real answer needs offline
renders with a declared seed, musical phase, and reset/tail rules. Half a day, and it needs NRT plumbing.

**Attribution is observational.** Even a clean, per-slot comparison says "the slot's contribution moved", not "this
edit caused it". The wire says so (`basis`, `confounds`, `attribution: unverified`) and the DJ's wording says so.
Keep it that way in any claim.

**Windows can still straddle a change.** `report.ts` marks mixed-revision windows and the evidence layer refuses
to build a stable comparison from them, but the *report the DJ reads* is still whatever the last two bars held.
After a change lands, the first report a DJ sees is partly the old mix. Fix: label the report with how much of its
window came after the last change. ~1 h.

## Protocol

**`observe` is in the spec but not in the host.** Levels are `suggest` and `auto` only; there is no way to mute an
agent's proposals without removing it from the booth. ~30 min.

**No reconnect or replay endpoint.** An outside agent that drops gets the latest snapshots on reconnect, not the
history it missed. The JSONL log has everything, but nothing serves it over the socket.

**Localhost only, no auth.** Fine for a laptop on stage; not fine for anything else.

**Second profile.** The spec claims the protocol is not about music, and nothing demonstrates that. A second
profile (a text editor, a spreadsheet, anything with slots and a measurable outcome) would either support the
claim or kill it. This is the strongest research move available and the least demoable.

## Host

**The bus fails silently if port 57400 is taken.** It emits `transport_error` and writes to stderr, which the TUI
shows in the header, but a second instance quietly has no socket for outside agents. ~15 min to make it try the
next free port and say which it took.

**`ears.sh` opens only two of the six slot files** in the editor pane.

**No no-network fallback.** If `claude -p` cannot reach the API, a round simply produces nothing. The rule-based
agent in `ears-protocol/examples/rule-agent.ts` could take over after a timeout. ~1 h, and worth doing before a
venue.

**The CLI could update underneath the set.** The docs say `claude -p` will move to a `--bare` default that does not
use subscription login. Pin the installed version and disable auto-update before the showcase.

## Sound

**Nothing here has been heard by its author.** Every instrument, style and transition was verified by measurement
on a muted engine: levels, spectral balance, no bad frames, no engine errors. Whether any of it sounds good is
unverified.

**The device sample rate is not controlled.** If macOS puts the output device in Bluetooth headset mode (24 kHz),
everything above 12 kHz disappears and filters near Nyquist misbehave. The engine now clamps every movable cutoff
and the TUI warns, but the real fix is the performer choosing a proper output device.
