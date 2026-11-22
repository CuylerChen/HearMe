"""One-JSON-per-line Unix sockets. Mode 0600. Payloads are not logged."""

import json
import os
import socket
import threading
from pathlib import Path

from workers.privacy import redact_event


def serve(path, on_message) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(path))
    os.chmod(path, 0o600)
    server.listen(8)
    print(json.dumps(redact_event({"type": "listen", "socket": path.name})), flush=True)
    while True:
        conn, _ = server.accept()
        threading.Thread(target=_client, args=(conn, on_message), daemon=True).start()


def _client(conn, on_message) -> None:
    buf = b""
    lock = threading.Lock()

    def send(message: dict) -> None:
        data = (json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8")
        with lock:
            conn.sendall(data)

    try:
        while True:
            chunk = conn.recv(1 << 20)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                message = json.loads(line.decode("utf-8"))
                on_message(message, send)
    except Exception as exc:
        print(json.dumps({"type": "socket_error", "error": type(exc).__name__}), flush=True)
    finally:
        conn.close()
