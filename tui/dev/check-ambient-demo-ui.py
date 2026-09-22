"""Projector smoke test: opening, instant choices and ambient powers in the real Ink UI."""
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
ansi = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

with tempfile.TemporaryDirectory(prefix="ears-ambient-demo-") as folder:
    work = Path(folder)
    source = work / "set"
    shutil.copytree(root / "tui/set", source)
    master, slave = pty.openpty()
    # The app's supported minimum. If these columns stay clean, wider projector terminals do too.
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 48, 90, 0, 0))
    env = {**os.environ, "TERM": "xterm-256color", "FORCE_COLOR": "1",
           "EARS_SET": str(source), "EARS_LOG_DIR": str(work / "logs"),
           "EARS_MOMENTS_DIR": str(work / "moments"), "EARS_BUS_PORT": "0"}
    proc = subprocess.Popen([str(root / "node_modules/.bin/tsx"), "tui/app.tsx", "--demo", "--manual"],
                            cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave,
                            start_new_session=True)
    os.close(slave)
    output = bytearray()

    def read(seconds):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([master], [], [], 0.05)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break

    def text():
        return ansi.sub("", output.decode(errors="replace"))

    def events():
        log = next(p for p in (work / "logs").glob("*.jsonl") if not p.is_symlink())
        return [json.loads(line) for line in log.read_text().splitlines()]

    try:
        read(5.6)
        rendered = text()
        assert "OPENING 1/4 touch + water" in rendered, "opening score is not labelled"
        assert "ARRANGE d4+" in rendered, "the instant arrangement choice did not arrive"
        assert "composing" in rendered or "ARRANGE d2+" in rendered, "the second seat is neither composing nor filled"
        assert not any(bad in rendered for bad in ["ambient syOPENING", "watedemo", "lydiandemo"]), "header columns overlap"

        os.write(master, b"K")
        read(0.5)
        rendered = text()
        assert all(name in rendered for name in ["CARVE", "FRACTURE", "REVEAL"]), "ambient power picker incomplete"
        os.write(master, b"\x1b")
        read(0.2)
        os.write(master, b"k")
        read(0.7)
        powers = [e for e in events() if e.get("type") == "proposal" and str(e.get("recipe_id", "")).startswith("ambient-skill-")]
        assert len(powers) == 2, f"k did not replace the round with two immediate power options: {[(e.get('type'), e.get('recipe_id'), e.get('reason')) for e in events()[-20:]]}"

        os.write(master, b"t")
        read(0.3)
        for char in "more tactile rhythm":
            os.write(master, char.encode())
            read(0.015)
        os.write(master, b"\r")
        read(0.7)
        logged = events()
        note = next((e for e in reversed(logged) if e.get("type") == "note"), None)
        assert note and note.get("text") == "more tactile rhythm", f"tell mode lost brief: note={note!r}; screen={text()[-1200:]!r}"
        directed = [e for e in logged if e.get("type") == "proposal" and e.get("t", 0) >= note["t"]]
        assert len(directed) >= 1 and directed[0].get("origin") == "recipe", "tell mode did not answer immediately"

        os.write(master, b"q")
        read(1.2)
        proc.wait(timeout=4)
        assert proc.returncode == 0, f"exit {proc.returncode}"
        assert not any(x in text() for x in ["TypeError", "ReferenceError", "SyntaxError"])
        print(json.dumps({"ok": True, "checks": ["scored opening label", "instant choice by 5.6s, second seat composing", "clean header", "K picker", "k immediate power", "tell keeps brief and answers immediately", "clean exit"]}))
    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=4)
        os.close(master)
