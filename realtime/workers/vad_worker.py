"""CPU Silero VAD. This process must not allocate GPU memory."""

import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np

from workers.common import prefix, sock_path
from workers.pcmutil import b64_to_int16
from workers.sockjson import serve
from workers.vad_gate import events_from_probs

WINDOW = 512
MODEL = None
STATE = None


def load_model():
    global MODEL, STATE
    import onnxruntime as ort

    path = prefix() / "models" / "silero_vad" / "silero_vad.onnx"
    if not path.exists():
        raise SystemExit("silero_vad.onnx missing")
    MODEL = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    STATE = np.zeros((2, 1, 128), dtype=np.float32)


def speech_prob(frame: np.ndarray) -> float:
    global STATE
    audio = frame.astype(np.float32).reshape(1, -1)
    feeds = {}
    for item in MODEL.get_inputs():
        if item.name in {"input", "audio"}:
            feeds[item.name] = audio
        elif item.name == "state":
            feeds[item.name] = STATE
        elif item.name == "sr":
            feeds[item.name] = np.array(16000, dtype=np.int64)
    outputs = MODEL.run(None, feeds)
    prob = float(np.asarray(outputs[0]).reshape(-1)[0])
    if len(outputs) > 1:
        STATE = np.asarray(outputs[1], dtype=np.float32)
    return prob


def on_message(message, send) -> None:
    if message.get("type") != "audio":
        return
    session_id = message.get("session_id", "")
    pcm = b64_to_int16(message.get("pcm16k_b64", "")).astype(np.float32) / 32768.0
    probs = []
    for offset in range(0, max(0, len(pcm) - WINDOW + 1), WINDOW):
        probs.append(speech_prob(pcm[offset : offset + WINDOW]))
    frame_ms = int(round(WINDOW / 16000 * 1000))
    for event in events_from_probs(probs, frame_ms, session_id=session_id):
        send(event)


def main() -> None:
    load_model()
    serve(sock_path("vad"), on_message)


if __name__ == "__main__":
    main()
