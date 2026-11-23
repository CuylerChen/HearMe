"""CPU Silero VAD. This process must not allocate GPU memory."""

import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np

from workers.common import prefix, sock_path
from workers.pcmutil import b64_to_int16
from workers.sockjson import serve
from workers.vad_gate import Gate

WINDOW = 512
MODEL = None
SESSIONS = {}


class SessionVad:
    def __init__(self) -> None:
        self.gate = Gate()
        self.h = np.zeros((2, 1, 64), dtype=np.float32)
        self.c = np.zeros((2, 1, 64), dtype=np.float32)
        self.remainder = np.zeros((0,), dtype=np.float32)

    def push(self, pcm: np.ndarray, session_id: str) -> list[dict]:
        audio = np.concatenate([self.remainder, pcm]) if self.remainder.size else pcm
        events = []
        offset = 0
        frame_ms = int(round(WINDOW / 16000 * 1000))
        while offset + WINDOW <= len(audio):
            prob, self.h, self.c = speech_prob(audio[offset : offset + WINDOW], self.h, self.c)
            events.extend(self.gate.push(prob, frame_ms, session_id))
            offset += WINDOW
        self.remainder = audio[offset:]
        return events


def load_model():
    global MODEL
    import onnxruntime as ort

    path = prefix() / "models" / "silero_vad" / "silero_vad.onnx"
    if not path.exists():
        raise SystemExit("silero_vad.onnx missing")
    MODEL = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def speech_prob(frame: np.ndarray, h: np.ndarray, c: np.ndarray):
    audio = frame.astype(np.float32).reshape(1, -1)
    feeds = {}
    for item in MODEL.get_inputs():
        if item.name in {"input", "audio"}:
            feeds[item.name] = audio
        elif item.name == "sr":
            feeds[item.name] = np.array(16000, dtype=np.int64)
        elif item.name == "h":
            feeds[item.name] = h
        elif item.name == "c":
            feeds[item.name] = c
    outputs = MODEL.run(None, feeds)
    named = {item.name: np.asarray(value) for item, value in zip(MODEL.get_outputs(), outputs)}
    prob = float(named["output"].reshape(-1)[0])
    return prob, named.get("hn", h), named.get("cn", c)


def on_message(message, send) -> None:
    session_id = message.get("session_id", "")
    kind = message.get("type")
    if kind == "reset":
        SESSIONS.pop(session_id, None)
        send({"type": "done", "session_id": session_id})
        return
    if kind != "audio":
        return
    pcm = b64_to_int16(message.get("pcm16k_b64", "")).astype(np.float32) / 32768.0
    state = SESSIONS.get(session_id)
    if not isinstance(state, SessionVad):
        state = SessionVad()
        SESSIONS[session_id] = state
    for event in state.push(pcm, session_id):
        send(event)
    send({"type": "done", "session_id": session_id})


def main() -> None:
    load_model()
    serve(sock_path("vad"), on_message)


if __name__ == "__main__":
    main()
