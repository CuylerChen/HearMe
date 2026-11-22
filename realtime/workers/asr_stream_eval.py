"""Stream one wav through 0.5s chunks and write metrics, including final text."""

import sys
import time

import numpy as np

from workers.asr_stream import CHUNK_SIZE_SEC, SAMPLE_RATE, StreamingSession
from workers.common import gpu_mib, model_dir, offline_env, report_dir


def load_pcm(path: str) -> np.ndarray:
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "pcm.s16"
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                path,
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "s16le",
                str(raw),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return np.frombuffer(raw.read_bytes(), dtype="<i2").copy()


def transcribe_file(model, path: str, language: str):
    session = StreamingSession(model, language, chunk_size_sec=CHUNK_SIZE_SEC)
    session.start()
    pcm = load_pcm(path)
    step = int(CHUNK_SIZE_SEC * SAMPLE_RATE)
    for offset in range(0, len(pcm), step):
        session.push_pcm16(pcm[offset : offset + step])
    session.finish()
    return session


def main() -> None:
    offline_env()
    import torch
    from qwen_asr import Qwen3ASRModel

    wav = sys.argv[1]
    language = sys.argv[2]
    report_name = sys.argv[3]
    model = Qwen3ASRModel.from_pretrained(
        str(model_dir("Qwen3-ASR-0.6B")),
        dtype=torch.bfloat16,
        device_map="cuda:0",
        max_inference_batch_size=1,
        max_new_tokens=64,
    )
    torch.cuda.synchronize()
    started = time.perf_counter()
    session = transcribe_file(model, wav, language)
    torch.cuda.synchronize()
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    lines = [
        "phase: asr_stream",
        "language: " + language,
        "backend: " + session.backend,
        "chunk_size_sec: 0.5",
        "final_text: " + session.text,
        "detected_language: " + (session.detected_language or ""),
        "wall_ms: " + str(elapsed_ms),
        "peak_mib: " + str(gpu_mib()),
        "nonempty: " + ("yes" if session.text.strip() else "no"),
    ]
    del model
    torch.cuda.empty_cache()
    lines.append("gpu_after_mib: " + str(gpu_mib()))
    path = report_dir() / report_name
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    if not session.text.strip():
        raise SystemExit(1)


if __name__ == "__main__":
    main()
