"""Streaming ASR worker. chunk_size_sec is 0.5. Transcripts are not logged."""

import os
import threading

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import torch
from qwen_asr import Qwen3ASRModel

from workers.asr_protocol import CancelGate, encode_final
from workers.common import model_dir, sock_path
from workers.pcmutil import b64_to_int16
from workers.sockjson import serve

GATE = CancelGate()
SESSIONS = {}
LOCK = threading.Lock()
MODEL = None


def load_model():
    global MODEL
    MODEL = Qwen3ASRModel.from_pretrained(
        str(model_dir("Qwen3-ASR-0.6B")),
        dtype=torch.bfloat16,
        device_map="cuda:0",
        max_inference_batch_size=1,
        max_new_tokens=64,
    )


def _language(value):
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() == "auto":
        return None
    return text


class LiveAsr:
    """One call. Transcribe while the person is still talking, then reuse that text."""

    def __init__(self, model, language):
        self.model = model
        self.language = language
        self.audio = np.zeros((0,), dtype=np.float32)
        self.covered = 0
        self.text = ""
        self.detected = language or ""

    def _float(self, pcm_int16: np.ndarray) -> np.ndarray:
        audio = np.asarray(pcm_int16).reshape(-1)
        if audio.size == 0:
            return audio
        if audio.dtype == np.int16:
            return audio.astype(np.float32) / 32768.0
        return audio.astype(np.float32, copy=False)

    def push(self, pcm_int16: np.ndarray) -> None:
        audio = self._float(pcm_int16)
        if audio.size == 0:
            return
        if audio.shape[0] >= self.audio.shape[0]:
            self.audio = audio

    def append(self, pcm_int16: np.ndarray) -> None:
        audio = self._float(pcm_int16)
        if audio.size == 0:
            return
        self.audio = np.concatenate([self.audio, audio])

    def refresh(self, force: bool = False) -> None:
        pending = int(self.audio.shape[0] - self.covered)
        if self.audio.shape[0] == 0:
            self.text = ""
            return
        # A finished turn should answer from what was already heard.
        if force and self.text:
            return
        if not force and pending < 12000:
            return
        window = self.audio[-6 * 16000 :]
        results = self.model.transcribe((window, 16000), language=self.language)
        if not results:
            return
        item = results[0]
        self.text = getattr(item, "text", "") or ""
        self.detected = getattr(item, "language", None) or self.language or ""
        self.covered = int(self.audio.shape[0])


def on_message(message, send) -> None:
    session_id = message.get("session_id", "")
    kind = message.get("type")
    if kind == "cancel":
        GATE.mark_cancelled(session_id)
        SESSIONS.pop(session_id, None)
        send({"type": "cancelled", "session_id": session_id})
        return
    if kind != "audio" or not GATE.allow(session_id):
        return
    language = _language(message.get("language"))
    pcm = b64_to_int16(message.get("pcm16k_b64", ""))
    with LOCK:
        state = SESSIONS.get(session_id)
        if not isinstance(state, LiveAsr) or state.language != language:
            state = LiveAsr(MODEL, language)
            SESSIONS[session_id] = state
        if pcm.size:
            if message.get("append"):
                state.append(pcm)
            else:
                state.push(pcm)
        if message.get("final"):
            state.refresh(force=True)
            text = state.text
            detected = state.detected or language or ""
            SESSIONS.pop(session_id, None)
            if GATE.allow(session_id):
                send(encode_final(session_id, text, detected))
            return
        state.refresh(force=False)
        send({"type": "partial", "session_id": session_id})


def main() -> None:
    load_model()
    serve(sock_path("asr"), on_message)


if __name__ == "__main__":
    main()
