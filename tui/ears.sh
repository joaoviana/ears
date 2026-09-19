#!/bin/sh
# The stage layout: your editor on the left, EARS on the right, one tmux window to project.
#   sh tui/ears.sh            (add --mute to run silent, --manual to only suggest when you press a)
cd "$(dirname "$0")/.."
tmux kill-session -t ears 2>/dev/null
tmux new-session -d -s ears "npx tsx tui/app.tsx $*"
tmux split-window -h -b -l 38% -t ears "${EDITOR:-vim} -O tui/set/d1.scd tui/set/d3.scd"
tmux attach -t ears
