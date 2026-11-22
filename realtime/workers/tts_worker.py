"""TTS worker. One semantic fragment, one synthesis call. 0.6B has no instruct."""

import json
import os
import threading

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import torch
from qwen_tts import Qwen3TTSModel

from workers.cancel import CancelSet
from workers.common import model_dir, prefix, sock_path
from workers.pcmutil import float_to_int16, int16_to_b64
from workers.sockjson import serve

CANCEL = CancelSet()
LOCK = threading.Lock()
MODEL = None
SPEAKERS = {}


def load_model() -> None:
    global MODEL, SPEAKERS
    path = prefix() / "realtime" / "speakers.json"
    if path.exists():
        SPEAKERS = json.loads(path.read_text(encoding="utf-8"))
    MODEL = Qwen3TTSModel.from_pretrained(
        str(model_dir("Qwen3-TTS-12Hz-0.6B-CustomVoice")),
        device_map="cuda:0",
        dtype=torch.bfloat16,
    )


PREFERRED = {
    "gentle": {"chinese": "Serena", "english": "Aiden", "japanese": "Ono_Anna", "korean": "Sohee"},
    "calm": {"chinese": "Vivian", "english": "Ryan", "japanese": "Ono_Anna", "korean": "Sohee"},
    "warm": {"chinese": "Serena", "english": "Aiden", "japanese": "Ono_Anna", "korean": "Sohee"},
    "thoughtful": {"chinese": "Uncle_Fu", "english": "Ryan", "japanese": "Ono_Anna", "korean": "Sohee"},
}


def speaker_for(language: str, voice_key: str = ""):
    preferred = PREFERRED.get(voice_key or "gentle", {}).get((language or "").lower())
    if preferred:
        return preferred
    if not language:
        return None
    if language in SPEAKERS:
        return SPEAKERS[language]
    lowered = language.lower()
    for key, value in SPEAKERS.items():
        if key.lower() == lowered:
            return value
    return None


def synthesize(message, send) -> None:
    request_id = message.get("request_id", "")
    seq = message.get("seq", 0)
    if not CANCEL.should_emit(request_id):
        send({"type": "cancelled", "request_id": request_id})
        return
    text = (message.get("text") or "").strip()
    language = message.get("language") or ""
    speaker = message.get("speaker") or speaker_for(language, message.get("voice_key") or "")
    if not text or not speaker:
        send({"type": "error", "request_id": request_id, "error": "speaker_unavailable"})
        return
    wavs, sample_rate = MODEL.generate_custom_voice(
        text=text,
        language=language,
        speaker=speaker,
        non_streaming_mode=True,
    )
    if not CANCEL.should_emit(request_id):
        send({"type": "cancelled", "request_id": request_id})
        return
    pcm = float_to_int16(wavs[0])
    send(
        {
            "type": "audio",
            "request_id": request_id,
            "seq": seq,
            "sample_rate": int(sample_rate),
            "pcm_b64": int16_to_b64(pcm),
        }
    )
    send({"type": "done", "request_id": request_id, "seq": seq})


def on_message(message, send) -> None:
    kind = message.get("type")
    request_id = message.get("request_id", "")
    if kind == "cancel":
        CANCEL.mark_cancelled(request_id)
        send({"type": "cancelled", "request_id": request_id})
        return
    if kind != "synthesize":
        return
    with LOCK:
        synthesize(message, send)


def main() -> None:
    load_model()
    serve(sock_path("tts"), on_message)


if __name__ == "__main__":
    main()
