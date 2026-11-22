"""Session content stays in memory. Logs and temp dirs must not keep it."""

import os
import shutil
from pathlib import Path

CONTENT_KEYS = ("text", "pcm_b64", "audio", "pcm16k_b64")


def redact_event(event: dict) -> dict:
    cleaned = dict(event)
    for key in CONTENT_KEYS:
        cleaned.pop(key, None)
    return cleaned


def session_root() -> Path:
    prefix = os.environ.get("HEARME_PREFIX", "/bigdata/hearme-ai")
    return Path(prefix) / "tmp" / "realtime"


def wipe_session(session_id: str) -> None:
    if not session_id or session_id in {".", ".."} or "/" in session_id or "\\" in session_id:
        raise ValueError("invalid session_id")
    target = session_root() / session_id
    if target.exists():
        shutil.rmtree(target)
