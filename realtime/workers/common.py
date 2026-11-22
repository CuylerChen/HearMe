"""Paths and metric helpers. Do not print transcript text from here."""

import os
import subprocess
from pathlib import Path


def prefix() -> Path:
    return Path(os.environ.get("HEARME_PREFIX", "/bigdata/hearme-ai"))


def sock_path(name: str) -> Path:
    return prefix() / "tmp" / "realtime" / f"{name}.sock"


def report_dir() -> Path:
    path = prefix() / "reports" / "realtime"
    path.mkdir(parents=True, exist_ok=True)
    return path


def model_dir(name: str) -> Path:
    return prefix() / "models" / name


def gpu_mib() -> int:
    out = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
        text=True,
    )
    return int(out.strip().splitlines()[0])


def offline_env() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
