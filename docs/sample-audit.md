# Sample library audit — the missing top octave

**Complaint:** the textures are too subtle, the show wants more highs.
**Cause:** the bundled library did not contain the highs. Every close-object recording had been
low-passed at 10–11 kHz during preparation, and every field recording had been resampled to 32 kHz,
which caps it at 16 kHz. No amount of gain restores a band that is not in the file, which is why all
the air in the set had to come from synthesis.

**Fix:** re-derive all seven files from their original sources, keeping the crop, the high-pass, the
fades and the level, and dropping the low-pass. `scripts/prepare-samples.sh` does it, pins the source
checksums and prints the measurement. Nothing was added to replace what was missing — no exciter, no
spectral band replication.

## Before and after

`>12k` is RMS after three cascaded two-pole high-pass sections at 12 kHz, so the measurement band is
the band rather than a slope into it. Reproduce it with:

```sh
ffmpeg -hide_banner -nostats -nostdin -i FILE \
  -af "highpass=f=12000:poles=2,highpass=f=12000:poles=2,highpass=f=12000:poles=2,astats=measure_perchannel=none" \
  -c:a pcm_f32le -f null -
```

| File | Rate before → after | Loudness before → after | >12 kHz before → after | Gain |
| --- | --- | --- | --- | --- |
| `texture/fingertips.wav` | 48 k → 48 k | -25.4 → -24.4 LUFS | -68.9 → **-57.2** dBFS | +11.7 dB |
| `texture/marbles.wav` | 48 k → 48 k | -25.8 → -25.3 LUFS | -56.7 → **-50.2** dBFS | +6.5 dB |
| `texture/paper.wav` | 48 k → 48 k | -23.8 → -24.0 LUFS | -56.0 → **-49.3** dBFS | +6.7 dB |
| `texture/brush.wav` | 48 k → 48 k | -27.0 → -25.9 LUFS | -56.3 → **-46.3** dBFS | +10.1 dB |
| `nature/waves.wav` | 32 k → 48 k | -26.2 → -26.2 LUFS | -76.6 → **-68.6** dBFS | +8.0 dB |
| `nature/birds.wav` | 32 k → 48 k | -19.5 → -19.5 LUFS | -95.4 → **-94.3** dBFS | +1.1 dB |
| `nature/rain.wav` | 32 k → 48 k | -27.1 → -27.1 LUFS | silent → **-111.2** dBFS | nil |

Above 16 kHz, where the field recordings previously had nothing at all: fingertips -83.7 → -65.4,
marbles -72.9 → -61.1, paper -71.5 → -59.0, brush -70.2 → -53.2, waves −∞ → -84.8, birds −∞ → -104.3.

Loudness moved by at most 1.1 dB, so every `\amp` in `tui/set`, `tui/seed.ts` and
`tui/ambient-arsenal.ts` is still valid. That was a constraint, not an accident — see AGENTS.md on
why levels are the dangerous part of this repo. Durations, channel counts and file roles are
unchanged; `~n.(\rain)`, `~t.(\fingertips)` and `~g.(...)` all resolve exactly as before.

## Other defects found and fixed

- **`rain.wav` ended in a quarter-second of digital silence.** `\nature` plays with `loop: 1`, so
  that was a hole on every wrap. It now fades out properly over 1 s.
- **The close-object files had no edge fades at all** — `fingertips.wav` started and ended on a
  non-zero sample, which ticks whenever `\start` lands near an edge. All four now get a 10 ms fade,
  short enough to leave the first transient intact.

## Defects found and left alone, on purpose

- **`paper.wav` is dual-mono** (channels identical to within -95 dB), and so are `rain.wav` and
  `birds.wav`, because their sources are mono. They stay stereo files because the instruments read
  two channels. Widening them would be invented stereo, not recorded stereo.
- **DC offset** was already negligible everywhere (≤ 2e-5) and the 35–120 Hz high-passes keep it there.
- **No dead air at any head or tail** other than rain's, and no abrupt loop points remain.

## What could not be fetched

Freesound serves the uploader's original file only behind a login; all four texture sources 302 to
`/home/login/`. The 192 kbit/s public preview is what both preparation passes used, and it is not the
binding constraint — measured, those previews carry real content to about 20 kHz, so the low-pass was
what removed the air, not the mp3.

The one file where this still costs something is `marbles.wav`, whose original is 96 kHz / 24-bit.
A logged-in re-derivation would improve it and nothing else in the library.

Licensing is verified for all seven: four CC0 1.0 (declaration read from each Freesound page) and
three public domain (`LicenseShortName: Public domain` from the Commons API). Origin URLs, creators
and SHA-256 digests are in the two `SOURCES.md` files.

## What a genuinely better texture library would need

None of this is reachable by processing what is already here.

- **Recordings made at 96 kHz.** The whole library is reconstructed from 44.1/48 kHz lossy sources.
  Slowing a close object to `\rate 0.34`, as `ambient-motes` does, drops its top octave to 6 kHz —
  the slower the gesture, the more high-rate source material it wants. This is the single biggest
  available improvement and it requires new recordings, not new filters.
- **True stereo close-miking.** Three of seven files are dual-mono. `\texture` pans them and `\cloud`
  reads one channel anyway, so a real coincident pair would add width the set currently synthesises
  with `\spread`.
- **Longer takes.** `marbles.wav` is 5 s and `fingertips.wav` 6.15 s. With `\start` wandering and
  `loop: 1` the ear starts recognising the loop. Sixty-second takes of the same objects would let
  `\start` roam without repeating.
- **Field recordings with air in them.** `rain.wav` and `birds.wav` are effectively empty above
  12 kHz at source — that is a property of the recordings, not of this pipeline. The bed will keep
  sounding dull up top until it is built from recordings that were made with air.
