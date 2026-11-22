"""Streaming ASR worker. chunk_size_sec is 0.5. Transcripts are not logged."""

import os
import threading

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import torch
from qwen_asr import Qwen3ASRModel

from workers.asr_protocol import CancelGate, encode_final, encode_partial
from workers.asr_stream import StreamingSession
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
        if state is None or state.language != language:
            state = StreamingSession(MODEL, language)
            state.start()
            SESSIONS[session_id] = state
        if pcm.size:
            state.push_pcm16(pcm)
        if message.get("final"):
            state.finish()
            text = state.text
            detected = state.detected_language or language or ""
            SESSIONS.pop(session_id, None)
            if GATE.allow(session_id):
                send(encode_final(session_id, text, detected))
            return
        partial = encode_partial(session_id, state.text, state.detected_language or language or "")
        filtered = GATE.filter_partial(partial)
        if filtered:
            send(filtered)


def main() -> None:
    load_model()
    serve(sock_path("asr"), on_message)


if __name__ == "__main__":
    main()
