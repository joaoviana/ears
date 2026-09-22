#!/usr/bin/env python3
"""Muted full-host regression: TCP proposal, keyboard take, sound evidence, stale take.
Uses a temporary set/roster/log and independent ports. No model calls.
"""
from collections import deque
import json
import os
from pathlib import Path
import pty
import fcntl
import termios
import struct
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
work = Path(tempfile.mkdtemp(prefix="ears-host-check-"))
(work / "set").mkdir()
shutil.copytree(ROOT / "tui/djs", work / "djs")
code = r"~d.(\d1, \instrument, \kick, \dur, 1, \amp, 0.4)"
for i in range(1, 7):
    (work / "set" / f"d{i}.scd").write_text(code if i == 1 else "")


def free_port(kind):
    with socket.socket(type=kind) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


port = free_port(socket.SOCK_STREAM)
engine_port = free_port(socket.SOCK_DGRAM)
server_port = free_port(socket.SOCK_DGRAM)
while server_port == engine_port:
    server_port = free_port(socket.SOCK_DGRAM)
env = dict(os.environ, EARS_ENGINE_DEBUG="", EARS_SET=str(work / "set"), EARS_DJS=str(work / "djs"),
           EARS_LOG_DIR=str(work / "logs"), EARS_BUS_PORT=str(port),
           EARS_PORT=str(engine_port), EARS_SC_PORT=str(server_port))
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
diagnostics = deque(maxlen=16)
proc = subprocess.Popen([str(ROOT / "node_modules/.bin/tsx"), "tui/app.tsx", "--keep", "--manual", "--mute"],
                        cwd=ROOT, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)


def drain():
    try:
        while True:
            chunk = os.read(master, 65536)
            if not chunk: break
            diagnostics.append(chunk[-8192:])
    except OSError:
        pass


threading.Thread(target=drain, daemon=True).start()


def messages():
    try:
        rows = (work / "logs/latest.jsonl").read_text().splitlines()
    except FileNotFoundError:
        return []
    out = []
    for row in rows:
        try:
            out.append(json.loads(row))
        except json.JSONDecodeError:
            pass  # final record may still be flushing
    return out


def wait(predicate, seconds=25):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        for m in reversed(messages()):
            if predicate(m):
                return m
        if proc.poll() is not None:
            raise RuntimeError(f"Host exited {proc.returncode}; inspect {work}")
        time.sleep(0.1)
    raise TimeoutError(f"Missing expected host event; inspect {work}")


def state():
    return next(m for m in reversed(messages()) if m["type"] == "state")


try:
    wait(lambda m: m["type"] == "observation" and m["quality"]["stable_state"], 35)
    with socket.create_connection(("127.0.0.1", port)) as sock:
        # Keep the TCP receive side drained during the test.
        def receive():
            try:
                while sock.recv(65536):
                    pass
            except OSError:
                pass
        threading.Thread(target=receive, daemon=True).start()

        def propose(request, revision, value="0.2"):
            m = dict(v=0, type="proposal", **{"from": "host-test"}, request_id=request,
                     based_on_revision=revision, evidence_ids=[], slot="d1",
                     set=[dict(key="amp", value=value)], expected_change="loudness down",
                     why="Check gain change", evidence="Muted test intention")
            sock.sendall((json.dumps(m) + "\n").encode())

        propose("bad-revision", "obsolete")
        assert "stale" in wait(lambda m: m.get("request_id") == "bad-revision" and m["type"] == "rejected")["reason"]
        propose("taken", state()["revision"])
        wait(lambda m: m.get("request_id") == "taken" and m["type"] == "proposal")
        os.write(master, b"1")
        comparison = wait(lambda m: m.get("request_id") == "taken" and m["type"] == "comparison")
        assert comparison["status"] == "measured", comparison
        stages = [m for m in messages() if m.get("request_id") == "taken"]
        assert [m["type"] for m in stages] == ["proposal", "verdict", "applied", "evaluated", "scheduled", "active", "comparison"]
        applied = next(m for m in stages if m["type"] == "applied")
        active = next(m for m in stages if m["type"] == "active")
        assert active["active_at_ms"] >= applied["t"] - 50
        assert next(m for m in stages if m["type"] == "scheduled")["scheduled_at_ms"] >= applied["t"] - 50
        assert (work / "set/d1.scd").read_text().strip() == code.replace("0.4", "0.2")
        previous_execution = active["execution_id"]
        (work / "set/d1.scd").write_text(code.replace("0.4", "0.2"))
        saved = wait(lambda m: m["type"] == "applied" and m.get("slot") == "d1" and m.get("author") == "human" and m["execution_id"] != previous_execution)
        wait(lambda m: m["type"] == "active" and m["execution_id"] == saved["execution_id"])
        propose("taken", state()["revision"])
        assert "duplicate" in wait(lambda m: m.get("request_id") == "taken" and m["type"] == "rejected")["reason"]
        revision = state()["revision"]
        propose("stale-at-take", revision, "0.1")
        wait(lambda m: m.get("request_id") == "stale-at-take" and m["type"] == "proposal")
        (work / "set/d2.scd").write_text(r"~d.(\d2, \instrument, \hat, \dur, 1, \amp, 0.1)")
        wait(lambda m: m["type"] == "state" and m["revision"] != revision)
        os.write(master, b"1")
        rejected = wait(lambda m: m.get("request_id") == "stale-at-take" and m["type"] == "rejected")
        assert "stale" in rejected["reason"]
        assert (work / "set/d1.scd").read_text().strip() == code.replace("0.4", "0.2")
        active_source = (work / "set/d1.scd").read_text().strip()
        (work / "set/d1.scd").write_text(r"~d.(\d1, \instrument, \kick, \dur, Pseq([)")
        failed = wait(lambda m: m["type"] == "error" and m.get("slot") == "d1")
        wait(lambda m: m["type"] == "state" and m.get("slots", {}).get("d1") == active_source)
        assert (work / "set/d1.scd").read_text().strip() == active_source
        assert not any(m["type"] == "active" and m.get("execution_id") == failed["execution_id"] for m in messages())
    result = dict(ok=True, log=str((work / "logs/latest.jsonl").resolve()), checks=["stale admission", "human take", "ordered receipts", "clock ordering", "measured comparison", "identical manual save re-evaluates", "duplicate request", "stale take preserves newer source", "syntax failure restores active source"])
finally:
    if proc.poll() is None:
        os.write(master, b"q")
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=5)
    (work / "terminal-tail.txt").write_text(re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", b"".join(diagnostics).decode("utf-8", errors="replace")))
    os.close(master)

assert any(m["type"] == "session_end" for m in messages()), "graceful quit must flush its closing log"
print(json.dumps(result))
