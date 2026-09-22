#!/usr/bin/env bash
# Re-derive the bundled nature and texture recordings from their public-domain / CC0
# originals.
#
# Why this exists: the first preparation pass low-passed every close-object recording
# (fingertips 10 kHz, marbles 11 kHz, paper 11 kHz, brush 10.5 kHz) and resampled the
# field recordings to 32 kHz, which hard-caps them at 16 kHz. The tactile detail the set
# leans on lives in exactly that band, so the whole library arrived with its top octave
# removed and every bit of air in the show had to come from synthesis instead. This script
# redoes the preparation keeping the crop, the high-pass, the fades and the level, and
# drops the low-pass. Nothing here invents bandwidth: no exciter, no spectral band
# replication. What the source does not contain, the output does not contain.
#
#   scripts/prepare-samples.sh              # all seven files
#   scripts/prepare-samples.sh texture      # just tui/samples/texture
#   scripts/prepare-samples.sh nature       # just tui/samples/nature
#   KEEP_CACHE=1 scripts/prepare-samples.sh # keep downloaded sources for inspection
#
# Requires ffmpeg + ffprobe (brew install ffmpeg) and network access. Nothing else:
# no sox, no python-soundfile, no SuperCollider.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${SAMPLE_CACHE:-${TMPDIR:-/tmp}/ears-sample-sources}"
UA="EARS-sample-prep/1.0 (+https://freesound.org)"
mkdir -p "$CACHE"

# --- where the originals come from ------------------------------------------------------
#
# Freesound serves the uploader's original file only behind a login, so the 192 kbit/s
# "high quality" preview is the best public source — the same one the first pass used.
# Measured, those previews carry real content out to ~20 kHz, so the low-pass, not the
# mp3, was what removed the air. Wikimedia Commons serves its originals directly; all
# three field recordings are 44.1 kHz there, which is why re-deriving at 48 kHz is worth
# doing and why 48 kHz is also the ceiling of what is honestly available.
#
# name|url|sha256-of-source
SOURCES=$(cat <<'EOF'
fingertips|https://cdn.freesound.org/previews/567/567863_10443988-hq.mp3|3a0201cb80da63d0a109efb52d6c1a7bdf8839e948455da895ed13494c65566d
marbles|https://cdn.freesound.org/previews/661/661650_14490715-hq.mp3|0800dd2bcb862905762a3be75258c7cd17585ce4e809064bda81326613e0b659
paper|https://cdn.freesound.org/previews/447/447926_9159316-hq.mp3|721b1b824654f3f670dc5c3900f17bdc670a6197b7899babe78199db95e8fb16
brush|https://cdn.freesound.org/previews/687/687070_11532701-hq.mp3|e64d1f34d0191cb98c89533eeeab8718c9384435da833944ec2d78d6806d3a1a
rain|https://upload.wikimedia.org/wikipedia/commons/3/3d/Rain.ogg|c34d12243125c28f09426c076019f8321b602347a8564c38be771cb997c1a152
birds|https://upload.wikimedia.org/wikipedia/commons/4/42/Bird_singing.ogg|ed1286d29b1ab6cc85e099861d1f8405dda7865df4d2ceb0cb1e946cd30900bd
waves|https://upload.wikimedia.org/wikipedia/commons/1/1f/Waves.ogg|8015cbcf2e8016ccdcaab103342cc53c105f2592e29c0fa754285c9b54bfaaba
EOF
)

# --- the recipes ------------------------------------------------------------------------
#
# start / length are the crop, recovered by envelope cross-correlation against the shipped
# files so the passage the set was tuned on is the passage that comes back.
#
# hp is the rumble filter, two-pole, matched to what the first pass left behind (measured
# band by band against the untouched source). There is deliberately no lp column.
#
# fadein / fadeout declick the ends. Close-object files get 10 ms — enough to kill the
# discontinuity at a loop point, short enough to leave the first transient intact. Field
# recordings keep the long fades they were prepared with, because they are played as
# overlapping layers with `loop: 1` and a hard edge would tick every pass.
#
# Levelling is the dangerous part of this repo (see AGENTS.md), so it is the part that
# changes least. Two modes:
#
#   ebu   two-pass ffmpeg loudnorm at the target this file was always documented with.
#         Linear where the gain fits under the true-peak ceiling; loudnorm falls back to
#         its dynamic mode only where it does not, which is what shaped these files the
#         first time. The close-object recordings use this.
#
#   gain  one static gain, chosen so the integrated loudness matches the file being
#         replaced. Nothing touches the dynamics. The field recordings use this: they were
#         never loudness-normalised, only filtered and faded, and they should stay that way.
#
# Either way the output lands within about a decibel of the loudness the set was tuned
# against, so every \amp in tui/set, tui/seed.ts and tui/ambient-arsenal.ts stays valid.
# Verify that after any change here; a texture that got quieter is a texture the performer
# will call subtle.
#
# name|dir|start|length|hp|fadein|fadeout|rate|codec|mode|lufs|tp
RECIPES=$(cat <<'EOF'
fingertips|texture|0.700|6.150|35|0.010|0.010|48000|pcm_s24le|ebu|-24|-3.0
marbles|texture|0|5.01475|35|0.010|0.010|48000|pcm_s24le|ebu|-25|-4.0
paper|texture|0|9.008917|45|0.010|0.010|48000|pcm_s24le|ebu|-24|-3.0
brush|texture|8.000|14.000|38|0.010|0.010|48000|pcm_s24le|ebu|-25|-4.0
rain|nature|0|10.3300|60|1.0|1.0|48000|pcm_s16le|gain|-27.08|-1.0
birds|nature|4|32.000|120|2.0|1.0|48000|pcm_s16le|gain|-19.45|-1.0
waves|nature|24|36.000|35|3.0|1.0|48000|pcm_s16le|gain|-26.23|-1.0
EOF
)

field() { printf '%s\n' "$SOURCES" | awk -F'|' -v n="$1" -v c="$2" '$1==n{print $c}'; }

fetch() {
  local name=$1 url out want got
  url=$(field "$name" 2); want=$(field "$name" 3)
  out="$CACHE/$name.${url##*.}"
  if [ ! -f "$out" ]; then
    echo "  fetching $url" >&2
    curl -fsSL -A "$UA" -o "$out" "$url"
  fi
  got=$(shasum -a 256 "$out" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    echo "  !! $name: source checksum changed" >&2
    echo "     expected $want" >&2
    echo "     got      $got" >&2
    echo "     The upstream file was re-encoded or replaced. Listen before trusting it," >&2
    echo "     then update the hash in this script and in SOURCES.md." >&2
    return 1
  fi
  printf '%s\n' "$out"
}

# integrated loudness and true peak of a file, as "I TP"
loudness() {
  ffmpeg -hide_banner -nostats -nostdin -i "$1" -af loudnorm=print_format=json -f null - 2>&1 \
    | tr -d ' \n' \
    | sed -n 's/.*"input_i":"\([^"]*\)".*"input_tp":"\([^"]*\)".*/\1 \2/p'
}

build() {
  local name=$1 dir start len hp fin fout rate codec mode lufs tp src chain tmp gain out
  local row; row=$(printf '%s\n' "$RECIPES" | grep "^$name|")
  IFS='|' read -r _ dir start len hp fin fout rate codec mode lufs tp <<< "$row"

  echo "$name:"
  src=$(fetch "$name")

  # two-pole high-pass, then the declick/level fades. No low-pass: that is the whole point.
  chain="highpass=f=$hp:poles=2"
  chain="$chain,afade=t=in:st=0:d=$fin:curve=tri"
  chain="$chain,afade=t=out:st=$(awk -v l="$len" -v f="$fout" 'BEGIN{printf "%.6f", l-f}'):d=$fout:curve=tri"

  tmp="$CACHE/$name.stage.wav"
  ffmpeg -v error -nostdin -y -ss "$start" -t "$len" -i "$src" \
    -af "$chain" -ac 2 -ar "$rate" -c:a pcm_f32le "$tmp"

  out="$ROOT/tui/samples/$dir/$name.wav"
  echo "  crop ${start}s +${len}s | hp ${hp}Hz | no lp | ${rate}Hz | $mode ${lufs} LUFS / ${tp} dBTP"

  if [ "$mode" = "ebu" ]; then
    # Two-pass loudnorm. LRA is parked at 20 LU so the target can never become an excuse
    # to compress the range; all that is wanted here is the right loudness at a safe peak.
    local m json
    json=$(ffmpeg -hide_banner -nostats -nostdin -i "$tmp" \
      -af "loudnorm=I=$lufs:TP=$tp:LRA=20:print_format=json" -f null - 2>&1 | tr -d ' \n')
    m=$(printf '%s' "$json" | sed -n \
      's/.*"input_i":"\([^"]*\)".*"input_tp":"\([^"]*\)".*"input_lra":"\([^"]*\)".*"input_thresh":"\([^"]*\)".*"target_offset":"\([^"]*\)".*/\1 \2 \3 \4 \5/p')
    local mi mtp mlra mth moff
    read -r mi mtp mlra mth moff <<< "$m"
    ffmpeg -v error -nostdin -y -i "$tmp" -af \
      "loudnorm=I=$lufs:TP=$tp:LRA=20:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$moff:linear=true" \
      -ar "$rate" -c:a "$codec" "$out"
  else
    local meas cur_i cur_tp
    meas=$(loudness "$tmp"); read -r cur_i cur_tp <<< "$meas"
    gain=$(awk -v ti="$lufs" -v tp="$tp" -v ci="$cur_i" -v ct="$cur_tp" \
      'BEGIN{a=ti-ci; b=tp-ct; printf "%.3f", (a<b?a:b)}')
    echo "  static gain ${gain} dB"
    ffmpeg -v error -nostdin -y -i "$tmp" -af "volume=${gain}dB" -ar "$rate" -c:a "$codec" "$out"
  fi

  [ -n "${KEEP_CACHE:-}" ] || rm -f "$tmp"
  report "$out"
}

# What this pass is for: the >12 kHz number. Three cascaded two-pole sections so the
# measurement band is actually the band, not a gentle slope into it.
report() {
  local f=$1 hi lo i t
  hi=$(ffmpeg -hide_banner -nostats -nostdin -i "$f" \
    -af "highpass=f=12000:poles=2,highpass=f=12000:poles=2,highpass=f=12000:poles=2,astats=measure_perchannel=none" \
    -c:a pcm_f32le -f null - 2>&1 | sed -n 's/.*RMS level dB: //p')
  lo=$(ffprobe -v error -show_entries stream=sample_fmt,sample_rate,channels \
    -show_entries format=duration -of csv=p=0 "$f" | tr -d '\n')
  local meas; meas=$(loudness "$f")
  read -r i t <<< "$meas"
  printf '  -> %-22s %s LUFS  %s dBTP  >12k %.1f dBFS\n' "$lo" "$i" "$t" "$hi"
  echo "  -> sha256 $(shasum -a 256 "$f" | cut -d' ' -f1)"
}

case "${1:-all}" in
  texture) names="fingertips marbles paper brush" ;;
  nature)  names="rain birds waves" ;;
  all)     names="fingertips marbles paper brush rain birds waves" ;;
  *)       names="$1" ;;
esac

for n in $names; do build "$n"; done
[ -n "${KEEP_CACHE:-}" ] || rm -rf "$CACHE"
