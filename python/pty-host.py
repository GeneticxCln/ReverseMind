#!/usr/bin/env python3
"""ReverseMind PTY host — JSON lines over stdin/stdout, one process per terminal."""
import base64
import json
import os
import pty
import select
import signal
import subprocess
import sys
import threading
import time

lock = threading.Lock()
terminals = {}
running = True


def emit(payload):
    with lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def reader(tid, master):
    while True:
        try:
            ready, _, _ = select.select([master], [], [], 0.25)
        except (OSError, ValueError):
            break
        if not ready:
            if tid not in terminals:
                break
            continue
        try:
            data = os.read(master, 65536)
        except OSError:
            data = b""
        if not data:
            break
        emit({"op": "data", "id": tid, "data": data.decode("utf-8", "replace")})
    terminals.pop(tid, None)
    try:
        os.close(master)
    except OSError:
        pass
    emit({"op": "exit", "id": tid})


def open_terminal(tid, cwd, cols, rows, shell):
    if tid in terminals:
        return
    master, slave = pty.openpty()
    import fcntl
    import struct
    import termios

    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", int(rows), int(cols), 0, 0))
    env = dict(os.environ)
    env.update({"TERM": "xterm-256color", "COLORTERM": "truecolor", "REVERSEMIND_TERMINAL": tid})
    executable = shell or env.get("SHELL") or "/bin/bash"
    try:
        proc = subprocess.Popen(
            [executable, "-l"],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            cwd=cwd if cwd and os.path.isdir(cwd) else os.path.expanduser("~"),
            env=env,
            preexec_fn=os.setsid,
            close_fds=True,
        )
    except Exception as exc:  # noqa: BLE001
        os.close(master)
        os.close(slave)
        emit({"op": "error", "id": tid, "error": str(exc)})
        return
    os.close(slave)
    terminals[tid] = {"master": master, "process": proc}
    emit({"op": "opened", "id": tid, "pid": proc.pid})
    threading.Thread(target=reader, args=(tid, master), daemon=True).start()


def write_terminal(tid, data):
    term = terminals.get(tid)
    if not term:
        return
    try:
        os.write(term["master"], data.encode("utf-8", "replace"))
    except OSError as exc:
        emit({"op": "error", "id": tid, "error": str(exc)})


def resize_terminal(tid, cols, rows):
    term = terminals.get(tid)
    if not term:
        return
    try:
        import fcntl
        import struct
        import termios

        fcntl.ioctl(term["master"], termios.TIOCSWINSZ, struct.pack("HHHH", int(rows), int(cols), 0, 0))
    except OSError:
        pass


def close_terminal(tid):
    term = terminals.pop(tid, None)
    if not term:
        return
    try:
        os.killpg(os.getpgid(term["process"].pid), signal.SIGTERM)
    except OSError:
        pass
    try:
        os.close(term["master"])
    except OSError:
        pass


def handle(line):
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        return
    op = msg.get("op")
    tid = msg.get("id", "")
    if op == "open":
        open_terminal(tid, msg.get("cwd"), msg.get("cols", 120), msg.get("rows", 30), msg.get("shell"))
    elif op == "write":
        write_terminal(tid, msg.get("data", ""))
    elif op == "resize":
        resize_terminal(tid, msg.get("cols", 120), msg.get("rows", 30))
    elif op == "close":
        close_terminal(tid)
    elif op == "shutdown":
        for key in list(terminals):
            close_terminal(key)
        global running
        running = False


def main():
    global running
    while running:
        line = sys.stdin.readline()
        if not line:
            break
        handle(line.strip())
    for key in list(terminals):
        close_terminal(key)


if __name__ == "__main__":
    main()
