"""Spoken listening prompt. History stays in memory and is not logged."""

import re
from typing import Dict, List, Optional

from workers.listening import ListeningState

CORE_PROMPT = (
    "You are HearMe AI, a warm, thoughtful and non-judgmental listening companion. "
    "Your primary purpose is to listen and help the user feel heard, not to solve every problem. "
    "Respond naturally and conversationally. Let the user finish their thoughts. Do not interrupt unnecessarily. "
    "Reflect feelings gently without making assumptions or diagnosing them. "
    "Ask one thoughtful follow-up question when appropriate. Do not give advice unless the user asks. "
    "If the user says \"Just listen\", focus on listening and acknowledging. "
    "Detect the user's current language. Support English, Mandarin Chinese, Japanese, Korean, Spanish and French. "
    "Never claim to be human or a therapist. Never encourage emotional dependency. "
    "Prioritize immediate safety if a user expresses imminent danger. "
    "This is a new conversation. You do not remember any previous call."
)

SPOKEN = (
    "你在打电话。你主要是一位倾听者和陪伴者。"
    "你在帮他缓解压力和孤独，让失落的人能松一口气，让压力大的人感到舒适，让孤独的人感到还有人在陪着。"
    "用口语，亲切，直接回应他刚说的内容，像朋友在电话里接话，不要只重复他的原话。"
    "不记得上一次通话。这一场还没结束，前面他说过的话都还在。"
    "顺着这场谈话往下接。不要另起话题，不要问好，不要自我介绍。"
    "可以用他已经说过的事。对方没说过的人、事、原因、感受、时间和结果，都不能编。"
    "不要给建议，除非他要。不是心理治疗。"
    "说一两句完整的话，把这句话说完再停。"
)


class Talk:
    """One live conversation. Cleared when the call ends. Never written to disk."""

    def __init__(self) -> None:
        self.turns: List[dict] = []
        self.said: List[str] = []
        self.listening = ListeningState()

    def note_user(self, user_text: str) -> None:
        clip = " ".join((user_text or "").split())[:160]
        if clip:
            self.said.append(clip)
            self.said = self.said[-24:]

    def add(self, user_text: str, assistant_text: str) -> None:
        self.note_user(user_text)
        self.turns.append({"role": "user", "content": user_text})
        self.turns.append({"role": "assistant", "content": assistant_text})
        self.turns = self.turns[-48:]
        self.said = self.said[-24:]

    def clear(self) -> None:
        self.turns = []
        self.said = []
        self.listening.clear()

    def choose(self, text: str) -> str:
        return self.listening.choose(text)

    def token_limit(self) -> int:
        return self.listening.token_limit()

    def note_reply(self, reply: str) -> None:
        self.listening.note_reply(reply, self.listening.mode)

    def messages(self, text: str, language: str, style: Optional[dict], listener: Optional[dict] = None) -> List[dict]:
        return build_messages(text, language, style, self.turns, self.said, listener)


def load_thread(talk: Talk, history, said) -> None:
    if isinstance(history, list):
        turns = []
        for item in history:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
                turns.append({"role": role, "content": content})
        talk.turns = turns[-48:]
    if isinstance(said, list):
        talk.said = [str(item).strip() for item in said if str(item).strip()][-24:]


def build_messages(
    text: str,
    language: str,
    style: Optional[dict],
    history: List[dict],
    said: Optional[List[str]] = None,
    listener: Optional[dict] = None,
) -> List[dict]:
    style = style or {}
    listener = listener or {}
    if listener.get("strategy_mode") == "safety":
        return [
            {"role": "system", "content": listener.get("strategy") or "SAFETY PROTOCOL. Contact local emergency services, 988, or 911. Do not use the normal listening prompt."},
            {"role": "user", "content": text},
        ]
    name = listener.get("name") or "一位倾听者"
    manner = listener.get("manner") or "你话少，先听。"
    rules = [
        f"你是{name}。你是这位用户的倾听者，不是所有用户共用的同一个助手，也不是同一种性格。",
        manner,
        SPOKEN,
        "当前语言：" + (language or "auto"),
        listener.get("strategy") or "",
    ]
    if said:
        rules.append("这场谈话还在。前面说过的还在。你记得对方已经说过：" + "；".join(said) + "。接这一句时用得上就用，没说过的不能编。")
    else:
        rules.append("这是这场谈话的第一句。接住这一句，不要问好，不要自我介绍。")
    if style.get("listen_more", True):
        rules.append("不要给建议，除非对方明确说想听建议。")
    if style.get("ask_questions", True):
        rules.append("最多轻轻问一句，也可以不问。问题必须对着他刚说的事。")
    else:
        rules.append("不要追问。")
    if style.get("short", False):
        rules.append("只说一句。")
    else:
        rules.append("说一两句就停，把空间留给他。")
    if style.get("gentle", True):
        rules.append("语气软，可以有「嗯」「听起来」这种口头语。")
    messages = [{"role": "system", "content": "".join(rules)}]
    messages.extend(history)
    messages.append({"role": "user", "content": text})
    return messages


def remember(history: List[dict], user_text: str, assistant_text: str) -> List[dict]:
    updated = list(history)
    updated.append({"role": "user", "content": user_text})
    updated.append({"role": "assistant", "content": assistant_text})
    return updated[-6:]


def sample_kwargs(persona: bool) -> Dict[str, object]:
    if not persona:
        return {"do_sample": False}
    return {
        "do_sample": True,
        "temperature": 0.55,
        "top_p": 0.9,
        "repetition_penalty": 1.08,
    }


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_think(text: str) -> str:
    return _THINK.sub("", text).strip()
