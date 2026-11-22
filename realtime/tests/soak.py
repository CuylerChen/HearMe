"""Single-user soak. Default is a short smoke; HEARME_SOAK_MINUTES=30 is the acceptance run."""

import os
import time
import urllib.request

PREFIX = os.environ.get("HEARME_PREFIX", "/bigdata/hearme-ai")
MINUTES = float(os.environ.get("HEARME_SOAK_MINUTES", "0.2"))
URL = os.environ.get("HEARME_GATEWAY", "http://127.0.0.1:18200/healthz")


def gpu_mib() -> str:
    import subprocess

    out = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
        text=True,
    )
    return out.strip().splitlines()[0]


def main() -> None:
    deadline = time.time() + MINUTES * 60
    samples = []
    while time.time() < deadline:
        with urllib.request.urlopen(URL, timeout=5) as resp:
            if resp.status != 200:
                raise SystemExit(f"health {resp.status}")
        samples.append(gpu_mib())
        time.sleep(5)
    report = os.path.join(PREFIX, "reports", "realtime", "soak.txt")
    os.makedirs(os.path.dirname(report), exist_ok=True)
    text = "\n".join(
        [
            "phase: soak",
            "minutes: " + str(MINUTES),
            "samples: " + str(len(samples)),
            "last_mib: " + (samples[-1] if samples else "none"),
            "acceptance_minutes: 30",
        ]
    )
    open(report, "w", encoding="utf-8").write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
