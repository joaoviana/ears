# Working on EARS

Read `tui/README.md` first — it is long and it is the authority on how the show behaves.
This file is only for things the repo does not tell you and that agents keep getting wrong.

## SuperCollider is installed, but not on `PATH`

`which sclang` returns nothing. It is here:

```sh
/Applications/SuperCollider.app/Contents/MacOS/sclang     # 3.14.1
```

Agents that check `which sclang`, conclude SuperCollider is missing, and fall back to
reasoning about levels arithmetically have all been wrong. **Measure instead.**

`sclang` does **not** read from stdin — `| sclang -d /tmp -` fails with `file "-" does not exist`.
Write a scratch `.scd` and pass it as a path:

```sh
SC=/Applications/SuperCollider.app/Contents/MacOS/sclang

# does engine.scd parse? (syntax only, no server needed)
cat > /tmp/compile.scd <<'SCD'
var src = File.readAllString("/absolute/path/to/soundcheck/tui/engine.scd");
if (src.compile.isNil) { "COMPILE-FAILED".postln } { "COMPILE-OK".postln };
0.exit;
SCD
$SC -d /tmp /tmp/compile.scd
```

Use an **absolute** path inside the script — sclang's cwd is not yours.

To check that one SynthDef's UGen graph really builds, extract it, turn `.add` into `;`,
stub `~safe = { |x| Sanitize.ar(x) }`, and call `.asBytes` on it. That catches bad UGen
wiring, which `.compile` does not.

A graph that builds is not a graph that has been heard. Say which one you did.

### Never boot a server on the performer's port

`engine.scd` line 12 only uses a custom port when `EARS_SC_PORT` is set; with it unset it falls
through to the default localhost server on **57110**, which is the port a live `npm run ears`
needs. `scsynth` is a sibling process, not a child, so when your `sclang` exits the server is
left reparented to init — still running, still playing, still holding 57110. The next boot then
fails with `audio port 57110 unavailable`, and the performer hears sound after quitting.

So on every sclang invocation that loads `engine.scd`:

```sh
EARS_SC_PORT=57191 EARS_PORT=57341 $SC -d /tmp yourscript.scd
```

Pure NRT (`Score.recordNRT`) binds no port and is unaffected. Before you finish, check you left
nothing behind:

```sh
ps -eo pid,ppid,etime,command | grep scsynth      # PPID 1 means an orphan
```

## Levels are the thing to be careful about

The multipliers at the end of each SynthDef are **not comparable across instruments**.
`\twig` and `\droplet` are impulse-excited and `.tanh`-limited internally, so they reach
near ±1 before `amp` applies. `\rustle` is sustained band-limited noise whose internal RMS
is roughly twenty times lower — which is why it carries `* 4.5` and is not thereby "3× too
loud". Compare dBFS after the internal scaling, not the trailing number.

The failure mode that actually bites: a level that is right for a **sparse** gesture is
wrong for a **sustained** one. Before raising an amp in `tui/ambient-arsenal.ts`, look at
that recipe's `\delta`. Dense deltas plus a loud amp plus a hot SynthDef is what swamps the bed.

## More than one agent works in this repo

Claude Code subagents and `codex` both edit these files, sometimes at the same time.

- `git diff --stat` before you write; re-read anything that changed since you read it.
- Make targeted edits. Never rewrite a whole file you did not just read.
- If another agent's edit disagrees with your brief, **flag it, do not silently overwrite it.**
- Assert the musical property in tests, not the instrument name — instruments get renamed
  underneath you mid-session.

## Checks

```sh
npm run test:ears         # 133 tests
npm run typecheck:ears
npm run ears:demo-check   # isolated demo TUI, no SuperCollider needed
npm run ears:reset        # restore tui/set/*.scd from tui/set.start/
```

Offline probes live in `tui/dev/`. The real-engine ones need free ports and run muted:

```sh
EARS_PORT=57341 EARS_SC_PORT=57191 npx tsx tui/dev/probe-ambient-opening.ts
```

## The ambient brief

`tui/direction.ts` holds what the model is told. Calm is a matter of **time scale**, not
dynamic range — a gesture may be genuinely deep, bright or absent so long as it takes its
time. Silence and removal are complete ideas. What stays forbidden is fake drama: risers,
drops, loud sweeps, or raising the gain on everything. And:

> A gesture that is too quiet to be heard over the field recordings is not subtle, it is absent.
