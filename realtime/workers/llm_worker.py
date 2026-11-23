"""LLM worker. A closed semantic fragment is emitted before generation ends."""

import os
import threading

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

from workers.cancel import CancelSet
from workers.common import model_dir, sock_path
from workers.persona import Talk, load_thread, sample_kwargs, strip_think
from workers.sockjson import serve
from workers.splitter import push_token

CANCEL = CancelSet()
LOCK = threading.Lock()
MODEL = None
TOKENIZER = None
HISTORY = {}


def load_model() -> None:
    global MODEL, TOKENIZER
    path = str(model_dir("Qwen3-4B-AWQ"))
    TOKENIZER = AutoTokenizer.from_pretrained(path, local_files_only=True)
    MODEL = AutoModelForCausalLM.from_pretrained(path, device_map="cuda:0", local_files_only=True)


def _style(message: dict) -> dict:
    return {
        "listen_more": bool(message.get("listen_more", True)),
        "ask_questions": bool(message.get("ask_questions", True)),
        "short": bool(message.get("short", False)),
        "gentle": bool(message.get("gentle", True)),
    }


def _talk(session_id: str) -> Talk:
    if session_id not in HISTORY:
        HISTORY[session_id] = Talk()
    return HISTORY[session_id]


def _listener(message: dict) -> dict:
    return {
        "id": message.get("listener_id") or "",
        "name": message.get("listener_name") or "",
        "manner": message.get("manner") or "",
    }


def _prompt(text: str, language: str, persona: bool, talk: Talk, style: dict, listener: dict) -> str:
    if persona:
        messages = talk.messages(text, language, style, listener)
    else:
        messages = [{"role": "user", "content": text}]
    try:
        return TOKENIZER.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        return TOKENIZER.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


def generate(message, send) -> None:
    request_id = message.get("request_id", "")
    if not CANCEL.should_emit(request_id):
        send({"type": "cancelled", "request_id": request_id})
        return
    text = (message.get("text") or "").strip()
    if not text:
        send({"type": "done", "request_id": request_id})
        return
    persona = bool(message.get("persona", True))
    session_id = message.get("session_id", "")
    talk = _talk(session_id) if persona and session_id else Talk()
    if persona:
        load_thread(talk, message.get("history"), message.get("said"))
    listener = _listener(message)
    if persona:
        talk.choose(text)
        listener["strategy"] = talk.listening.instruction()
        listener["strategy_mode"] = talk.listening.mode
        max_new = talk.token_limit()
    else:
        max_new = int(message.get("max_new_tokens") or 32)
    prompt = _prompt(text, message.get("language") or "", persona, talk, _style(message), listener)
    inputs = TOKENIZER(prompt, return_tensors="pt").to("cuda:0")
    streamer = TextIteratorStreamer(TOKENIZER, skip_prompt=True, skip_special_tokens=True)
    gen_kwargs = {
        "input_ids": inputs["input_ids"],
        "max_new_tokens": max_new,
        "streamer": streamer,
    }
    gen_kwargs.update(sample_kwargs(persona))
    if "attention_mask" in inputs:
        gen_kwargs["attention_mask"] = inputs["attention_mask"]
    worker = threading.Thread(target=MODEL.generate, kwargs=gen_kwargs)
    worker.start()
    buf = ""
    spoken = []
    seq = 0
    for piece in streamer:
        if not CANCEL.should_emit(request_id):
            break
        parts, buf = push_token(buf, strip_think(piece) if "<think>" in piece else piece)
        for part in parts:
            if not CANCEL.should_emit(request_id):
                break
            cleaned = strip_think(part)
            if not cleaned:
                continue
            spoken.append(cleaned)
            send({"type": "sentence", "request_id": request_id, "text": cleaned, "seq": seq})
            seq += 1
    worker.join()
    tail = strip_think(buf)
    if CANCEL.should_emit(request_id) and tail:
        spoken.append(tail)
        send({"type": "sentence", "request_id": request_id, "text": tail, "seq": seq})
        seq += 1
    if persona and session_id and text:
        if spoken and CANCEL.should_emit(request_id):
            reply = "".join(spoken)
            talk.add(text, reply)
            talk.note_reply(reply)
        else:
            talk.note_user(text)
    if CANCEL.should_emit(request_id):
        send({"type": "done", "request_id": request_id})
    else:
        send({"type": "cancelled", "request_id": request_id})


def on_message(message, send) -> None:
    kind = message.get("type")
    request_id = message.get("request_id", "")
    if kind == "forget":
        HISTORY.pop(message.get("session_id", ""), None)
        send({"type": "forgotten", "session_id": message.get("session_id", "")})
        return
    if kind == "cancel":
        CANCEL.mark_cancelled(request_id)
        send({"type": "cancelled", "request_id": request_id})
        return
    if kind != "generate":
        return
    with LOCK:
        generate(message, send)


def main() -> None:
    load_model()
    serve(sock_path("llm"), on_message)


if __name__ == "__main__":
    main()
