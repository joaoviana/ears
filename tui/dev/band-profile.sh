#!/bin/sh
# Per-band RMS of a WAV, so "warmer" can be argued with numbers instead of adjectives.
#   sh tui/dev/band-profile.sh file.wav [more.wav ...]
#
# The bands match what the TUI's own ears report, so a render can be compared with a live reading:
#   sub <80 · low 80-200 · body 200-600 · mid 600-2k · high 2k-8k · air >8k
# Warmth is a SHAPE, not a direction: body present, sub controlled, air present but smooth. A mix that is
# dark AND boomy AND closed on top is muddy, and making it darker makes it worse.
set -e
band() {   # file lo hi
  if [ "$2" = "-" ]; then f="lowpass=f=$3:poles=2";
  elif [ "$3" = "-" ]; then f="highpass=f=$2:poles=2";
  else f="highpass=f=$2:poles=2,lowpass=f=$3:poles=2"; fi
  ffmpeg -hide_banner -i "$1" -af "$f,astats=measure_perchannel=none" -f null - 2>&1 |
    grep -m1 'RMS level dB' | sed 's/.*: *//' | cut -c1-6
}
printf "%-26s %7s %7s %7s %7s %7s %7s   %s\n" FILE sub low body mid high air SHAPE
for f in "$@"; do
  [ -f "$f" ] || { echo "no such file: $f" >&2; continue; }
  s=$(band "$f" - 80); l=$(band "$f" 80 200); b=$(band "$f" 200 600)
  m=$(band "$f" 600 2000); h=$(band "$f" 2000 8000); a=$(band "$f" 8000 -)
  # one-word read: the two failure modes this set actually has
  # +0 forces numeric comparison: awk string-compares values that arrive with stray whitespace, and
  # "-44.26" > "-42.44" is true as text and false as a number, which mislabelled every row.
  shape=$(awk -v s="$s" -v b="$b" -v a="$a" -v m="$m" 'BEGIN{
    s+=0; b+=0; a+=0; m+=0;
    if (s > b + 6 && a < b - 25) print "muddy: sub over body, no air";
    else if (a < b - 30) print "closed on top";
    else if (s > b + 6) print "boomy";
    else if (b < m - 6) print "scooped low-mid: thin, not warm";
    else print "-" }')
  printf "%-26s %7s %7s %7s %7s %7s %7s   %s\n" "$(basename "$f")" "$s" "$l" "$b" "$m" "$h" "$a" "$shape"
done
