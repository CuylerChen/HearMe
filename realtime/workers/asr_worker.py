"""Streaming ASR worker. chunk_size_sec is 0.5. Transcripts are not logged."""

import os
import threading

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import torch
from qwen_asr import Qwen3ASRModel

from workers.asr_protocol import CancelGate, encode_final
from workers.asr_stream import StreamingSession
from workers.common import gpu_lock, model_dir, sock_path
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


def _new_session(language) -> StreamingSession:
    state = StreamingSession(MODEL, language)
    state.start()
    return state


def on_message(message, send) -> None:
    session_id = message.get("session_id", "")
    kind = message.get("type")
    if kind == "cancel":
        with LOCK:
            GATE.mark_cancelled(session_id)
            SESSIONS.pop(session_id, None)
        send({"type": "cancelled", "session_id": session_id})
        return
    if kind != "audio":
        return
    language = _language(message.get("language"))
    pcm = b64_to_int16(message.get("pcm16k_b64", ""))
    final = bool(message.get("final"))
    append = bool(message.get("append"))
    with LOCK:
        if final or not append:
            GATE.reset(session_id)
        if not GATE.allow(session_id):
            return
        state = SESSIONS.get(session_id)
        if not isinstance(state, StreamingSession) or state.language != language or (final and not append):
            state = _new_session(language)
            SESSIONS[session_id] = state
        if pcm.size:
            state.push_pcm16(pcm)
        if not final:
            send({"type": "partial", "session_id": session_id})
            return
        SESSIONS.pop(session_id, None)
    with gpu_lock():
        state.finish()
    if GATE.allow(session_id):
        send(encode_final(session_id, state.text, state.detected_language or language or ""))


def main() -> None:
    load_model()
    serve(sock_path("asr"), on_message)


if __name__ == "__main__":
    main()
