# EARS: the next level, agentically

Written Sat 19 Sept 2026, 22:00, for the Wed 23 Sept showcase. Based on a read of the code as it stood then
(`soundcheck` at `8e7762a` plus uncommitted `tui/evidence.ts` and `tui/report.ts`; `ears-protocol` at `2a34fe1`).
Nothing was run: a live set was playing.

## Thesis

EARS already has the hard social part of agency right: agents that can only propose, a host that validates, a human
who grants and revokes. What it lacks is **consequences**. A DJ says "darker", the human takes it, and nobody ever
checks whether it got darker; the DJ is never told, never graded, and forgets everything when the set ends. Every
item below serves one stage sentence: *"It can't hear, so it has to call its shot. The host measures. It gets told
when it was wrong, and it remembers."* That is self-verification, memory and learning from verdicts, built as
structure in the host rather than as prompt text, and it is legible from the back of a room. Build that loop first,
then let it persist (notebook), then show an outside agent living in the same loop (guest DJ), then, if time allows,
let agents test ideas before speaking (rehearsal). A set-arc director is the first thing to cut.

## Read this first: the working tree is inconsistent right now

Found while reading; it changes day one.

- `ears-protocol` (committed) already speaks "evidence v1": `state.revision`, observation ids, `request_id`,
  execution receipts (`evaluated / scheduled / active / superseded`), a `comparison` message, and
  `expected_change` on proposals. `src/mcp.ts` makes `based_on_revision` **required** and tells the agent "never
  invent it".
- The host does not speak it. `tui/app.tsx` never imports `tui/evidence.ts` (untracked, complete-looking, 97 lines).
  Its `state` messages carry no `revision`; its `proposal` echo, `rejected` and `verdict` carry no `request_id`; it
  never emits `active`.
- Consequence: through the MCP bridge today, `read_room` returns no revision (so the guest must invent one), and
  `EarsClient.proposeAndWait` can never match its proposal, its rejection or its verdict, so every `propose` call
  hangs for 20 s and returns `pending`. The README's guest-DJ demo ("`propose` returns whether it was refused, taken
  or skipped") is broken until the host catches up. The rule agent also still keys on the deprecated `same`.
- The good news: `Evidence` is 80% of idea 1. `begin()` → `evaluated()` → `active()` → `observe()` already produces
  a before/after `comparison` with `differences` (via `metricDelta` in `report.ts`), marks unstable windows, and
  refuses stale revisions. It only needs wiring and a grader.

If another session is mid-way through wiring this, coordinate before starting item 1; the grader and feedback parts
are independent of it.

## Ranked top 5

Ranked by what I would protect for Wednesday (value on stage ÷ risk), not by how interesting they are.

### 1. Called shots: predict → measure → grade → feed back

**What.** Every patch must carry a machine-checkable prediction. Two or four bars after it lands, the host grades
it against its own measurement and tells the DJ. A per-DJ scoreboard shows calls right / calls made.

**Why it's a step up.** Today the loop closes only in the sense that the next report contains the consequences; the
agent is never confronted with its own claim. This makes each DJ a self-correcting agent with a track record, and
it turns "the assistant can't hear" from a caveat into the premise. It is the GPT note's best idea, and the
plumbing for it is already written.

**60-second stage moment.** DJ offers "close the hat filter · EXPECT high down". Take it. A card appears for four
bars: `CALLED high ↓ · HEARD high −4.1 dB ✓`, the DJ's tally ticks to `calls 3/4`. Then the one that matters: a call
that misses (`CALLED sub ↑ · HEARD sub +0.2 dB ✗ flat`). Next round the same DJ's fix angle opens with a
correction, in character. Say out loud: "nobody prompted that; the host told it it was wrong."

**Build sketch.**
- `tui/agent.ts`: add to the patch grammar `EXPECT <metric> <up|down|same>` (1–2 lines), metric ∈
  `sub low mid high air centroid onsets envelope crest`. `parsePatch()` parses it into `expect: {metric, dir}[]`;
  in `ask()`, a patch with no valid EXPECT is `rejected` ("made no testable call"). That is the enforcement; the
  SYSTEM text only teaches the syntax. Add `expect` to `Suggestion`, and `outcome?: string` to `Past`; the
  "WHAT HAPPENED TO EARLIER IDEAS" block becomes `taken d2: … · you called high down · measured −4.1 dB · RIGHT`.
- New `tui/grade.ts`: `grade(expect, differences) → hit | miss | flat | unknown`, thresholds in one table
  (bands ±1.5 dB relative, centroid ±10%, onsets ±0.3/beat, envelope ±1.5 dB). `unknown` whenever the comparison is
  `unavailable`, a fill (`forBars`) or a transition rode through the window, or a human edit intervened. Unknown is
  a valid, displayed result, not a miss.
- `tui/app.tsx`: instantiate `Evidence(session, bus.send)`; replace the hand-rolled `state`/`observation` sends in
  `newBase`, the chokidar handler and `onBar` with `evidence.sync()` / `evidence.observe()`; pass
  `{revision, active_revision}` into `ears.current.push()`; in `take()` call `evidence.begin(slot, code, agent,
  {proposal, request_id, expected_change})`; in the `evald` handler call `evidence.evaluated()`; mark `active()` on
  the first `/bar` after a good eval. On each `comparison` for a DJ's execution: grade, send an `outcome` message,
  update `Guest.calls/hits`, push to `history`, show the card (reuse `greet`). Inbound proposals: echo
  `request_id`, run `evidence.check()` for stale revisions. Booth pane: `calls 3/4` next to `taken`.
- `tui/skills.ts`: `earned()` counts **hits**, not takes. Skills earned by being right, not by being liked. One-line
  change, much better story; **K** remains the escape hatch.
- `tui/bus.ts` `pretty()`: lines for `comparison` and `outcome`. `ears-protocol`: add `outcome` to `types.ts` and
  SPEC; change `expected_change: string` to the structured `expect` in `mcp.ts`.

**Effort.** 7–8 h including the Evidence wiring (4 h if someone else lands the wiring).

**Main risk.** The master bus is a blunt instrument: a bass cutoff change under a loud pad may read `flat`, and
stochastic patterns move the numbers on their own. Mitigate by measuring the noise floor first (compare consecutive
stable windows of an unchanged set; set thresholds above it), and by letting `flat`/`unknown` be honest outcomes.
A scoreboard of 2/5 on stage is fine; a scoreboard that is obviously random is not. Check with `--mute` runs and
the JSONL log before trusting it.

### 2. The notebook: DJs that remember across sets

**What.** Each DJ file gains a host-written `# Notebook` section (≤ 8 lines): what this performer takes and skips,
and which of the DJ's own calls keep missing. It is injected with the persona next set.

**Why it's a step up.** Memory and learning from verdicts, across sessions, in the same skill-shaped markdown file
that already holds `skills:`. The file is the agent; the agent's file changes because of what happened. It is
diffable, revocable by deleting a line, and version-controlled: the "grant" philosophy applied to memory.

**60-second stage moment.** Left pane, open `tui/djs/detroit-130.md`. "Monday it didn't have this section." Read
two lines aloud: *"Skips anything that touches d1. My bass-cutoff calls on `low` miss when d5 is a pad; call
`centroid` instead."* Then show the next proposal obeying it.

**Build sketch.**
- New `tui/notebook.ts`: (a) deterministic stats from the session's wire log (take rate per slot and angle, hit
  rate per metric): no model, always works; (b) one `claude -p` reflection call (normal effort, off the critical
  path) that turns stats + this set's graded history + the old notebook into ≤ 8 lines. Host enforces the cap and
  strips anything that isn't a plain bullet.
- `tui/djs.ts`: `notebook: string[]` on `DJ`, parsed in `parse()`, written in `toMarkdown()`.
  `tui/agent.ts` `persona()`: append "What you've learned about this performer".
- `tui/app.tsx`: trigger on retire (`x`), on quit (`q`, before `exit`), and every 8 verdicts.
- Stretch (1.5 h): "learn me". `Evidence.begin()` already logs a `source_diff` for human edits; `summon()` with the
  performer's last N diffs as the description writes a DJ called YOU.

**Effort.** 3–4 h (+1.5 h stretch).

**Main risk.** A wrong lesson hardens. Cap, rewrite rather than append, keep it human-editable, and commit the DJ
files before the show so a bad notebook is one `git checkout` away.

Why not Claude Code's native subagent memory: the `memory:` frontmatter field is real (`user | project | local`,
`MEMORY.md` injected at start) but it auto-enables Read/Write/Edit for the agent. The built-in DJs' whole safety
story is `--tools ""`. Host-written memory keeps that intact.

### 3. Guest DJ: Claude Code in the other pane, as a real skill

**What.** Fix the bridge (falls out of item 1), then ship a genuine Claude Code skill,
`ears-protocol/skills/guest-dj/SKILL.md`, that runs the full agentic loop through MCP: `read_room` → `propose`
with a call → wait for the outcome → `read_room` for the comparison → one `say` line on whether it was right →
adjust → repeat for N rounds.

**Why it's a step up.** The built-in DJs are one-shot text generators the host drives. The guest is a self-paced,
tool-using, multi-turn agent with its own context that experiences the protocol the way the spec says: `propose`
*returns the consequence*. Same validator, same verdicts, same scoreboard. And it puts a real skill in front of the
person who designed skills.

**60-second stage moment.** Right pane: `claude` launched with only the EARS tools
(`--strict-mcp-config --mcp-config ears.json --tools ""`; verify that `--tools ""` leaves MCP tools available).
Type `/guest-dj dubbier, 6 rounds`. Robot walks into the booth. It proposes, you take, its terminal prints
"called high ↓, measured −3.8 dB, right; next I'll…". Then ask it to "just write the file yourself": it has no tool
that can, and a smuggled `unixCmd` shows up red on the wire as `rejected`. Hand it `auto` with **o** and step back.

**Build sketch.**
- `ears-protocol/src/mcp.ts`: add `wait_for` (blocks until the next `observation | comparison | verdict`, 30 s
  cap) so the agent doesn't spin on `read_room`; `propose` takes the structured `expect`; `read_room` includes
  recent `outcome`s. `src/client.ts`: track `outcome`. Fix `examples/rule-agent.ts` (`same` → `same_summary`, add a
  call) and `examples/mcp-smoke.ts`.
- `ears-protocol/skills/guest-dj/SKILL.md` + `ears.json`; README section. Stretch (1 h):
  `npm run ears:export-dj <id>` writes a DJ's markdown as a skill so the guest can *be* DETROIT 130: one file, two
  runtimes.
- `tui/app.tsx` inbound handler: `request_id` echo and stale check (item 1), and let remote guests earn skills on
  hits like everyone else (currently `!g.remote`).

**Effort.** 4–5 h after item 1.

**Main risk.** A full Claude Code turn is 10–30 s; two idle bars of silence from the guest is fine musically but
dead on stage. Rehearse the exact prompt, keep the built-in DJs rotating alongside it, and have
`examples/rule-agent.ts` ready as the no-model guest if the network is bad.

### 4. Rehearsal: render the idea offline before saying it

**What.** A warm, separate sclang process renders the current set and the candidate for 4 bars with
`Score.recordNRT` (no audio device, no UDP port, cannot touch the live server), measures both with one analyser,
and stamps the option: `rehearsed ✓ high −3.9 dB` or `rehearsal disagrees ✗`. Second step, only if the first is
solid: on a disagreement the DJ gets one revision turn with the rendered numbers.

**Why it's a step up.** This is the biggest jump in agency of the five: the agent uses a tool to test its own idea
and revises before a human ever sees it. It also gives the screen all three evidence strengths from the GPT note:
*predicted / rehearsed / heard*. It is ranked 4th only because it is the riskiest build.

**60-second stage moment.** Options appear in 3 s as today, tagged `rehearsing…`; badges land a moment later. One
flips to ✗, the diff rewrites itself (`cutoff 900 → 450`), badge goes ✓. Take it; the live grade confirms.

**Build sketch.**
- The trick that makes it cheap: in the audition interpreter, redefine `~d` to collect a `Pbind` instead of
  starting a `Pdef`, keep `~x` as is, so slot source evaluates **unchanged**. `Ppar(voices).asScore(4 bars)` +
  `\space`, `\master` → `recordNRT` → WAV. Set `thisThread.randSeed` before each render so before/after share a
  random stream (not a perfect match when event structure changes; say so in the badge tooltip/log).
- SynthDefs must be shared, not copied (`offline/supercollider/render.scd` is already a drifted copy with 5
  instruments). Move the defs from `tui/engine.scd` into `tui/synths.scd` (reads `~fx`, `~duck`, which may be `Bus`
  objects live or integers in NRT); `engine.scd` loads and `.add`s them; new `tui/audition.scd` loads and
  `asBytes`es them. This touches the live engine: do it early and re-verify with `tui/probe*.ts` and `make-ref.ts`.
- New `tui/audition.ts`: spawn/keep the sclang child, job queue, WAV → `Profile`-shaped numbers (RMS, five bands
  with the same centres, centroid via the FFT in `audio.ts`; onsets/beat counted exactly from the score), then
  `metricDelta` + `grade` from item 1. `tui/agent.ts` `ask()`: emit the option immediately, attach the badge via a
  second callback; never block the first idea. Skip `\vox` candidates (`not rehearsed`).
- Free by-product, worth more than it looks: `npm run ears:bench`. Frozen `(slots, report)` fixtures → `ask()` →
  render → "DJ calls match the render N% of the time". That is the GPT note's fixture corpus, it is how a builder
  who cannot hear verifies items 1 and 2, and it is one honest number to say on stage.

**Effort.** 2 h spike (warm sclang, render current set, print numbers, time it), then 6–8 h. Bench +2 h.

**Main risk.** Unknown NRT cost (class-library boot is seconds; hence the warm process), SynthDef extraction
regressing the live engine, and render/live disagreement on effect tails. Timebox the spike; if a 4-bar render
isn't under ~1.5 s warm, keep only the bench and drop the live badge.

### 5. The director: someone planning the next five minutes

**What.** A slower agent (every 16 bars, normal effort, `--json-schema` is fine here since latency is off the
critical path) that reads the trend (`trend.current`), who is in the booth and their scoreboards, and emits a plan:
phase, energy/brightness targets, who plays next, when to build. The host shows it as a one-line "set plan" strip
and relays it as a `note` to the DJs. It may only send `note`s; under a new `direct` grant the host also acts on
its cues (turn order, `ride("build")`, `enter()`).

**Why it's a step up.** Planning over time and genuine role separation: per-phrase DJs vs an arranger, all under
the same two-message protocol.

**60-second stage moment.** The strip reads `bars 64–96: strip back → DUB SIREN in at 80 → build at 94`; at bar 80
DUB SIREN walks in on its own under the grant.

**Build sketch.** New `tui/director.ts` (prompt, schema, `plan()`); `tui/app.tsx`: call from `onBar` when
`n % 16 === 0`, header strip, plan → `s.note` for the next rounds, `direct` grant on a key; SPEC: `plan` as an
informational host message.

**Effort.** 5–6 h. **Main risk.** An arc takes minutes and the slot is three; on stage it reads as a status line
unless takeover is running. It is real agency and a weak demo. First to cut.

## Not now

- **Built-in DJs as real Claude Code subagents/skills.** Would need settings discovery on (slower start) and, for
  native memory, file tools; it weakens the `--tools "" --setting-sources ""` guarantee for no audible gain. Keep
  them skill-*shaped*; make real skills for the guest (item 3).
- **Per-voice ears.** Right idea, wrong week: it re-routes every voice in the live engine. NRT solo renders (item 4)
  give attribution later without touching the live graph.
- **Crowd verdicts via QR.** Needs venue wifi, a server and moderation; fails the robustness test and isn't agency.
- **Channels (host pushes events into the guest's session).** The native fit, but research preview: custom servers
  need `--dangerously-load-development-channels`, and Team/Enterprise orgs have it off until an Owner enables it.
  `wait_for` gets the same effect with plain MCP. Mention it as "where this goes".
- **One long-lived `claude -p --input-format stream-json` process per DJ.** Documented, would remove the ~2 s spawn
  cost and give in-set context; but it means three processes per DJ for parallel angles and unmeasured context
  growth. A 1 h spike with `tui/dev/time-*.mts` after the show.
- **Astra's full contract** (clock-mapping uncertainty, capabilities negotiation, LUFS). Correct and invisible from
  a stage. `evidence.ts` already took the parts that matter.
- **A second protocol profile.** Would prove "not about music"; Thursday.

## Day by day

**Sunday: the loop (item 1).** Morning: check whether Evidence wiring is already in flight; wire it; confirm on
the wire with `--mute` that `state.revision`, `active` and `comparison` appear and that
`ears-protocol/examples/mcp-smoke.ts` now resolves taken/refused in under a bar. Measure the unchanged-set noise
floor from the JSONL and set the thresholds. Afternoon: `EXPECT` grammar + rejection, `grade.ts`, `outcome`, the
card, the scoreboard, history feedback, skills-on-hits. Evening: a 20-minute muted takeover run; read the log; are
the grades believable?

**Monday: persistence and the guest (items 2, 3).** Morning: `notebook.ts`, DJ file round-trip, run two short sets
so real notebooks exist for Wednesday; commit the DJ files. Afternoon: `wait_for`, structured `expect` in MCP, the
`guest-dj` skill, fix the rule agent; rehearse the exact guest prompt three times and time it. Evening: the 2 h
rehearsal spike (item 4). Decide go/no-go on numbers, not hope.

**Tuesday: finish, freeze, rehearse.** Morning, if the spike passed: `synths.scd` extraction, `audition.ts`, badge
only (no revision turn), `ears:bench`. If it failed: bench only, or the director if you'd rather. **Freeze at
14:00.** Afternoon: safety work, then three full run-throughs of the 3-minute script on the real projector
resolution, with sound, with a human who can hear.

Safety work (do not skip; ~2 h total):
- Pin the CLI. Installed is 2.1.278. The docs say `--bare` "will become the default for `-p` in a future release",
  and bare mode does not read the subscription login. An auto-update before Wednesday could break every DJ. Set
  `DISABLE_AUTOUPDATER=1` until Thursday.
- No-network fallback. Drop the angle timeout in `claudeText()` from 40 s to ~12 s on stage, and if no angle
  answers, surface the rule agent's proposal (it can make calls too). The called-shot loop then still demos with
  zero model calls.
- Bring the README in line with the code (it still says four slots, five instruments, a JSON schema and the **y**
  key in places). Someone in that room will read it.

**Cut order when time runs out:** director → rehearsal's revision turn → rehearsal's live badge (keep the bench) →
"learn me" → DJ-as-skill export. Never cut: item 1, the notebook, the CLI pin, the fallback.

## The 3-minute script this adds up to

0:00 one line on the premise (it can't hear; the host measures). 0:20 a DJ calls a shot, you take it, the card
confirms. 0:50 a miss, and the correction next round. 1:20 open the DJ's markdown: the notebook, and `skills:`
earned by being right. 1:50 the guest: Claude Code with three tools, its own call, its own grade, a refused escape
attempt on the wire. 2:30 **O**: everyone on `auto`, scoreboards ticking, hands off. 2:50 "every line of that is in
`latest.jsonl`."

## What the docs changed

- `--bare` is recommended for scripted calls and headed to be the `-p` default, but needs `ANTHROPIC_API_KEY`;
  with subscription billing the current flag set is the right one, and the version must be pinned.
- Subagent `memory:` and `skills:` frontmatter exist and work through `--agents` JSON in `-p` mode; memory forces
  file tools on, which is why the notebook is host-written.
- Skills run in `-p` mode and `/skill-name` expands in the prompt string, so the guest demo can also be scripted
  headless as a fallback (`claude -p "/guest-dj …" --mcp-config ears.json`).
- Channels exist but are research preview with org gating; not for this stage.
- Streaming input (`--input-format stream-json`) gives a persistent multi-turn process; promising for latency and
  in-set memory, untested here.
