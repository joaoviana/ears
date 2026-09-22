# Nature recordings

The bundled WAV files are short, level-controlled excerpts made for this project from public-domain
recordings. They are **48 kHz stereo, 16-bit**, high-passed and faded at both ends, with one static gain
each — they are not loudness-normalised and their dynamics are untouched. No attribution is required; the
sources are recorded here so their provenance remains clear.

Rebuild any of them with `scripts/prepare-samples.sh nature`, which pins the source checksums and prints the
measurement.

These were previously resampled to 32 kHz, which capped them at 16 kHz and cost a few dB in the 8–12 kHz
region on top of that. They are now derived at 48 kHz from the Commons originals, which are 44.1 kHz — that
is the honest ceiling here, and no more bandwidth than that exists upstream. Be clear-eyed about what it
bought: `waves.wav` gained 8 dB above 12 kHz and is genuinely airier; `rain.wav` and `birds.wav` gained
almost nothing, because their sources contain almost nothing up there (see the table). If the show needs a
bright field recording, it needs a different field recording, not more processing of these.

| Local file | Source | Creator | Licence | Local transformation |
| --- | --- | --- | --- | --- |
| `rain.wav` | [Rain.ogg](https://commons.wikimedia.org/wiki/File:Rain.ogg) | ジダネ | Public domain | full 10.33-second recording; 60 Hz high-pass; 1 s fades; -0.42 dB; 48 kHz stereo |
| `birds.wav` | [Bird singing.ogg](https://commons.wikimedia.org/wiki/File:Bird_singing.ogg) | jc | Public domain | 32-second excerpt from 00:04; 120 Hz high-pass; 2 s / 1 s fades; -0.90 dB; 48 kHz stereo |
| `waves.wav` | [Waves.ogg](https://commons.wikimedia.org/wiki/File:Waves.ogg) | Dsw4 | Public domain | 36-second excerpt from 00:24; 35 Hz high-pass; 3 s / 1 s fades; -0.27 dB; 48 kHz stereo |

| Local file | Loudness | True peak | >12 kHz RMS | Previously | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `rain.wav` | -27.1 LUFS | -16.9 dBTP | -111.2 dBFS | silent above 12 kHz | `34338fd3857b16a771172dd550716f90fd6c151c8e8bc1afe9150dc73ce357f5` |
| `birds.wav` | -19.5 LUFS | -5.0 dBTP | -94.3 dBFS | -95.4 dBFS | `c6a9d4f55087fcdcc411865056ce55e841225bd9466788a48cf838d12c79f9ce` |
| `waves.wav` | -26.2 LUFS | -7.7 dBTP | -68.6 dBFS | -76.6 dBFS | `f33345920c558878d3cb6697b16a45d10b2d0f1d7659959fb00dd2d5e6b02aa4` |

`rain.wav` also lost a quarter-second of digital silence that the previous pass left glued to its tail; with
`loop: 1` in `\nature` that was a hole on every wrap. It now fades out properly.

`Rain.ogg` and `Bird singing.ogg` are mono at source, so the two channels of `rain.wav` and `birds.wav` are
identical. They are stereo files because `\nature` reads two channels, not because there is a stereo image in
them. `Waves.ogg` is true stereo and stays that way. Nothing here was widened artificially.

The source pages contain the public-domain declarations and original files.
