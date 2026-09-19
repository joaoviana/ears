#!/bin/sh
# Renders the native engines to public/renders so the browser can A/B them.
# SuperCollider is looked for in /Applications first, then the repo-local copy in .tools/.
set -e
cd "$(dirname "$0")/.."
SCLANG=/Applications/SuperCollider.app/Contents/MacOS/sclang
[ -x "$SCLANG" ] || SCLANG=.tools/SuperCollider.app/Contents/MacOS/sclang
[ -x "$SCLANG" ] || { echo "SuperCollider not found. See offline/README.md"; exit 1; }
mkdir -p public/renders
"$SCLANG" offline/supercollider/render.scd "$PWD/public/renders/sc-raw.wav" 60 2>&1 | grep -E "ERROR|RENDER DONE" || true
node scripts/loop-wav.mjs public/renders/sc-raw.wav public/renders/detroit-supercollider.wav 130 16
rm -f public/renders/sc-raw.wav
