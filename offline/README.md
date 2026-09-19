# Offline engines

**None of this has been run on this machine.** SuperCollider, GHC and Sonic Pi aren't installed, so these files
are the reference brief written out by hand, to show what the code looks like and what setup costs. Expect to fix
small things on first run.

| Engine | Install | Then |
|---|---|---|
| SuperCollider | `brew install --cask supercollider` | open `supercollider/detroit.scd`, ⌘-A, ⌘-Enter |
| TidalCycles + SuperDirt | the above, then `Quarks.checkForUpdates({Quarks.install("SuperDirt", "v1.7.3"); thisProcess.recompile()})` in SC, then `brew install ghcup && ghcup install ghc && cabal install tidal --lib`, plus an editor plugin | `SuperDirt.start` in SC, evaluate `tidal/detroit.tidal` |
| Sonic Pi | `brew install --cask sonic-pi` | paste `sonic-pi/detroit.rb`, Run |
| Orca | download from hundredrabbits.itch.io/orca | see `orca/README.md` |

The cheapest way to hear the SuperCollider ceiling without learning it: install SC + SuperDirt only, and keep
writing Strudel. Strudel can send its events over OSC to SuperDirt instead of WebAudio (`.osc()` plus the
`@strudel/osc` bridge), so the patterns, the scheduler hooks and the LLM contract stay exactly as they are.
