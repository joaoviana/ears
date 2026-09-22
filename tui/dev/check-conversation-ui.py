"""Exercise the real terminal question/reply flow with a delayed composer and temporary source."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="ears-conversation-") as folder:
    work = Path(folder)
    source = work / "set"
    shutil.copytree(root / "tui/set", source)
    before = {p.name: p.read_bytes() for p in source.glob("*.scd")}
    bindir = work / "bin"
    bindir.mkdir()
    cli = bindir / "claude"
    cli.write_text("#!" + shutil.which("node") + "\n" + """
const groove = process.argv.join(' ').includes('PERFORMER DIRECTION: Reshape');
const move = groove
  ? 'SLOT d2\\nSET amp = ~x.("X--X--X---X--X--", 0.2)\\nEXPECT density same\\nWHY fixture rhythm answer\\nEVIDENCE current offbeats'
  : 'SLOT d5\\nSET midinote = Pseq([60, 64, 67, 72], inf)\\nEXPECT density same\\nWHY fixture melodic answer\\nEVIDENCE current phrase';
setTimeout(() => { process.stdout.write(move); }, 1800);
""")
    cli.chmod(0o755)
    # Hold optional source review indefinitely: it must never gate the offered move.
    preload = work / "review.mjs"
    preload.write_text("""
import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.typesafe.ai/v1/systemone') throw new Error('unexpected network request');
  writeFileSync(process.env.REVIEW_MARKER, 'started');
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) reject(new Error('cancelled'));
    else options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  });
};
""")
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 48, 140, 0, 0))
    env = {**os.environ, "PATH": str(bindir) + os.pathsep + os.environ["PATH"],
           "TERM": "xterm-256color", "FORCE_COLOR": "1", "EARS_SET": str(source),
           "EARS_LOG_DIR": str(work / "logs"), "EARS_MOMENTS_DIR": str(work / "moments"),
           "EARS_BUS_PORT": "0", "EARS_CONVERSATION": "1", "EARS_JEV_RANK": "1",
           "JEV_API_KEY": "fixture-key", "REVIEW_MARKER": str(work / "review-started"),
           "NODE_OPTIONS": '--import "' + str(preload) + '"'}
    proc = subprocess.Popen([str(root / "node_modules/.bin/tsx"), "tui/app.tsx",
                             "--demo", "--keep", "--manual", "--mute"],
                            cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()

    def read(seconds):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            ready, _, _ = select.select([master], [], [], 0.05)
            if ready:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break

    def screen():
        return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output.decode(errors="replace"))

    def events():
        log = next(p for p in (work / "logs").glob("*.jsonl") if p.name != "latest.jsonl")
        return [json.loads(line) for line in log.read_text().splitlines()]

    try:
        read(1.5)
        os.write(master, b"a")
        read(0.7)
        assert "Keep this groove or reshape it?" in screen(), screen()[-3000:]
        assert not any(e["type"] == "proposal" for e in events())
        os.write(master, b"2")
        read(2)
        proposals = [e for e in events() if e["type"] == "proposal"]
        assert len(proposals) == 1, (proposals, screen()[-3000:])
        assert proposals[0]["why"] == "fixture rhythm answer", proposals
        assert (work / "review-started").exists(), "review must start without delaying the option"
        assert before == {p.name: p.read_bytes() for p in source.glob("*.scd")}, "answering must not apply the move"
        os.write(master, b"y")
        read(0.6)
        assert (source / "d2.scd").read_bytes() != before["d2.scd"], "taking must apply the chosen move"
        os.write(master, b"a")
        read(0.7)
        assert "Where should the melody sit against this groove?" in screen(), screen()[-3000:]
        (source / "d1.scd").write_text('~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.1)\n')
        read(0.2)
        os.write(master, b"1")
        read(2)
        assert len([e for e in events() if e["type"] == "proposal"]) == 1, "changed source must invalidate preparation"
        assert "the set changed while composing" in screen(), screen()[-3000:]
        os.write(master, b"q")
        read(1.5)
        proc.wait(timeout=5)
        assert proc.returncode == 0, screen()[-3000:]
        assert not any(x in screen() for x in ["TypeError", "ReferenceError", "SyntaxError"])
        print("PASS: immediate question, selected reply, nonblocking review, separate take, changed-source rejection, clean exit")
    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=5)
        os.close(master)
