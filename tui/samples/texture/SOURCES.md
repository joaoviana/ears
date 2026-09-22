# Tactile texture sources

All four recordings are **CC0**. The repository copies are stereo 48 kHz, 24-bit WAV files made from
Freesound's public high-quality preview, with a high-pass, a 10 ms declick fade at each end, and loudness
normalization. **There is no low-pass.** An earlier pass filtered every one of these at 10–11 kHz, which
removed exactly the band that makes a close object sound close; re-deriving them without it returned 6–12 dB
of energy above 12 kHz. Nothing was added to replace what was missing — no exciter, no band replication —
because a synthesised top octave on a real recording is audible as a lie and the grading protocol depends on
the bed being honest.

Rebuild any of them with `scripts/prepare-samples.sh texture`, which pins the source checksums and prints the
measurement.

Freesound serves the uploader's original file only behind a login, so the 192 kbit/s preview is the best
public source and is what both passes used. Measured, those previews carry real content out to about 20 kHz;
the low-pass, not the mp3, is what the library was missing.

## `fingertips.wav`

- Source: [Finger - slide - wood - tap 2.wav](https://freesound.org/people/ValentinPetiteau/sounds/567863/)
- Creator: ValentinPetiteau
- Description: fingertips hitting and sliding off a wooden beam, recorded with a Zoom H5
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Process: 6.15 s from 00:00.70 of the high-quality preview; 48 kHz stereo; 35 Hz high-pass; 10 ms fades;
  loudness-normalized to -24 LUFS / -3 dBTP; no low-pass
- Measured: -24.4 LUFS, -3.0 dBTP, >12 kHz RMS **-57.2 dBFS** (was -68.9 at -25.4 LUFS)
- SHA-256: `71a421a91e95c651a0e2ea80c926d9d2ee147b5716d0f4a4d0e2457340feddb8`

## `marbles.wav`

- Source: [Glass Marbles Rolling on Wood.wav](https://freesound.org/people/Solar01/sounds/661650/)
- Creator: Solar01
- Description: stereo glass marbles rolling on wood, originally recorded at 96 kHz / 24-bit
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Process: the whole 5.01 s preview; 48 kHz stereo; 35 Hz high-pass; 10 ms fades; loudness-normalized to
  -25 LUFS / -4 dBTP; no low-pass
- Measured: -25.3 LUFS, -4.0 dBTP, >12 kHz RMS **-50.2 dBFS** (was -56.7 at -25.8 LUFS)
- Note: the 96 kHz / 24-bit original is the one file in this library with genuine ultrasonic headroom
  upstream, and it is behind Freesound's login. A logged-in re-derivation would improve this file further.
- SHA-256: `f4133395ff263634359d322dd44ce2354bf45c0e4a60c666c323f3b5d347de95`

## `paper.wav`

- Source: [Crunchy Paper](https://freesound.org/people/Breviceps/sounds/447926/)
- Creator: Breviceps
- Description: close paper scrunching and folding
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Process: 9.01 s from 00:00 of the high-quality preview; 48 kHz stereo; 45 Hz high-pass; 10 ms fades;
  loudness-normalized to -24 LUFS / -3 dBTP; no low-pass
- Measured: -24.0 LUFS, -3.0 dBTP, >12 kHz RMS **-49.3 dBFS** (was -56.0 at -23.8 LUFS)
- Note: the source is dual-mono — the two channels are identical to within -95 dB. The file is stereo because
  the instruments expect two channels, not because there is a stereo image in it. `\texture` pans it, and
  `~g.(\paper)` reads channel 0 only, so nothing is lost; but widening it here would be invented, not recorded.
- SHA-256: `e52a5de8822c59a9ea74401f7d5b1026318367fcacb5672d9185b1256c268ad0`

## `brush.wav`

- Source: [Forest Brush Percussion 1 Pitched Down 1](https://freesound.org/people/deadrobotmusic/sounds/687070/)
- Creator: deadrobotmusic
- Description: long close forest-brush and wood texture, already recorded at a lowered pitch
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Process: 14 s from 00:08 of the high-quality preview; 48 kHz stereo; 38 Hz high-pass; 10 ms fades;
  loudness-normalized to -25 LUFS / -4 dBTP; no low-pass
- Measured: -25.9 LUFS, -3.9 dBTP, >12 kHz RMS **-46.3 dBFS** (was -56.3 at -27.0 LUFS)
- SHA-256: `4661145cca3623d553d41105c2bc9e0d64fee8803a90c348dbab96383157e3a6`
