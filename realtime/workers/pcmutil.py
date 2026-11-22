"""PCM conversions. Callers decide whether bytes are kept."""

import base64

import numpy as np


def b64_to_int16(payload: str) -> np.ndarray:
    if not payload:
        return np.zeros((0,), dtype=np.int16)
    raw = base64.b64decode(payload)
    if len(raw) % 2:
        raw = raw[:-1]
    return np.frombuffer(raw, dtype="<i2").copy()


def int16_to_b64(pcm: np.ndarray) -> str:
    audio = np.asarray(pcm, dtype="<i2")
    return base64.b64encode(audio.tobytes()).decode("ascii")


def float_to_int16(audio: np.ndarray) -> np.ndarray:
    clipped = np.clip(np.asarray(audio, dtype=np.float32), -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2")
