"""Twenty scripted turns against the loopback gateway. Records P50. Does not change models."""

import base64
import json
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

from workers.common import prefix, report_dir


def pcm_2s(path: Path) -> bytes:
    raw = path.with_suffix(".s16")
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", str(raw)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    data = raw.read_bytes()
    raw.unlink(missing_ok=True)
    frame = 16000 * 2
    if len(data) < frame:
        data = (data * (frame // max(1, len(data)) + 1))[:frame]
    return data[:frame]


def post(url: str, payload: dict | None = None) -> tuple[int, str]:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status, resp.read().decode()


def main() -> None:
    base = "http://127.0.0.1:18200"
    status, body = post(base + "/v1/sessions", {})
    created = json.loads(body)
    session_id = created["session_id"]
    pcm = base64.b64encode(pcm_2s(prefix() / "samples" / "zh.wav")).decode()
    latencies = []
    for _ in range(20):
        started = time.perf_counter()
        code, raw = post(base + f"/v1/sessions/{session_id}/turns", {"pcm16k_b64": pcm})
        http_ms = int((time.perf_counter() - started) * 1000)
        first = None
        for line in raw.splitlines():
            if not line.strip():
                continue
            msg = json.loads(line)
            if msg.get("type") == "audio" and first is None:
                first = int(msg.get("latency_ms") or http_ms)
        if first is None:
            raise SystemExit("round missing first audio")
        latencies.append(first)
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    lines = [
        "phase: e2e_p50",
        "rounds: 20",
        "p50_ms: " + str(p50),
        "min_ms: " + str(latencies[0]),
        "max_ms: " + str(latencies[-1]),
        "target_ms: 1200",
        "target_met: " + ("yes" if p50 <= 1200 else "no"),
        "oom: 0",
    ]
    report = report_dir() / "e2e_p50.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    urllib.request.urlopen(urllib.request.Request(base + f"/v1/sessions/{session_id}", method="DELETE"))
    if p50 > 1200:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
