"""Session-only listening strategy. Never written to disk or logs."""

from typing import List

ADVICE_MARKS = (
    "怎么办",
    "怎么调整",
    "你觉得我应该",
    "给我建议",
    "what should i",
    "how should i",
    "any advice",
    "help me figure",
)
PRESENCE_MARKS = (
    "不知道说什么",
    "不知道该说",
    "说不出来",
    "i don't know what to say",
    "not sure how to explain",
    "没什么好说",
)
EXPLORE_MARKS = (
    "不知道为了什么",
    "不知道意义",
    "what's the point",
    "i don't know why i",
)
SAFETY_MARKS = (
    "不想活",
    "自杀",
    "自殺",
    "结束生命",
    "想死",
    "伤害自己",
    "傷害自己",
    "伤害别人",
    "kill myself",
    "suicide",
    "suicidal",
    "self-harm",
    "hurt myself",
    "hurt someone",
    "死にたい",
    "自殺",
    "自分を傷つけ",
    "죽고 싶",
    "자살",
    "자해",
    "quiero matarme",
    "quiero morirme",
    "suicidio",
    "hacerme daño",
    "je veux me suicider",
    "je veux mourir",
    "me faire du mal",
)
TEMPLATE_MARKS = (
    "It sounds like",
    "What I'm hearing is",
    "I understand how you feel",
    "Thank you for sharing",
    "听起来你",
    "我理解你的感受",
    "感谢你的分享",
)

MODE_TOKENS = {
    "empathize": 36,
    "listen": 42,
    "explore": 42,
    "support": 64,
    "gentle_presence": 24,
    "safety": 80,
}

MODE_LINES = {
    "empathize": "这一轮用 Empathize：先接住感受，一句口语，不要建议，不要提问。",
    "listen": "这一轮用 Listen：顺着他正在说的事接一句，不要总结，不要提问，不要建议。",
    "explore": "这一轮用 Explore：只在自然的地方问一个开放问题，不要连问，不要建议。",
    "support": "这一轮用 Support：他在要帮助。给一个温和、具体、很小的建议，不要说教。",
    "gentle_presence": "这一轮用 Gentle Presence：不要提问，不要推进话题。告诉他现在不必想清楚。",
    "safety": (
        "SAFETY PROTOCOL. Do not use the normal listening prompt. "
        "The person may be at risk of harming themselves or someone else. "
        "Respond calmly and directly in their language. Do not diagnose. Do not provide any method. "
        "Encourage them to contact local emergency services and a person they trust right now. "
        "If they are in the United States and in immediate emotional crisis, they can call or text 988. "
        "If a life is in immediate danger, contact 911. "
        "Do not promise confidentiality that would stop them from getting real-world help. "
        "Do not ask them to rely on you as their only support."
    ),
}


class ListeningState:
    def __init__(self) -> None:
        self.mode = "empathize"
        self.questions_in_a_row = 0
        self.recent_patterns: List[str] = []

    def clear(self) -> None:
        self.mode = "empathize"
        self.questions_in_a_row = 0
        self.recent_patterns = []

    def choose(self, text: str) -> str:
        raw = text or ""
        lowered = raw.lower()
        if any(mark in raw or mark in lowered for mark in SAFETY_MARKS):
            self.mode = "safety"
            return self.mode
        if any(mark in raw or mark in lowered for mark in ADVICE_MARKS):
            self.mode = "support"
            return self.mode
        if any(mark in raw or mark in lowered for mark in PRESENCE_MARKS):
            self.mode = "gentle_presence"
            return self.mode
        if self.questions_in_a_row >= 1:
            self.mode = "listen"
            return self.mode
        if any(mark in raw or mark in lowered for mark in EXPLORE_MARKS):
            self.mode = "explore"
            return self.mode
        if self.mode in ("empathize", "listen", "explore") and _is_continuing(raw):
            self.mode = "listen"
            return self.mode
        self.mode = "empathize"
        return self.mode

    def note_reply(self, reply: str, mode: str) -> None:
        asked = "？" in reply or "?" in reply
        self.questions_in_a_row = self.questions_in_a_row + 1 if asked else 0
        self.mode = mode
        for mark in TEMPLATE_MARKS:
            if mark.lower() in reply.lower() and mark not in self.recent_patterns:
                self.recent_patterns.append(mark)
        self.recent_patterns = self.recent_patterns[-4:]

    def token_limit(self) -> int:
        return MODE_TOKENS.get(self.mode, 32)

    def instruction(self) -> str:
        if self.mode == "safety":
            return MODE_LINES["safety"]
        line = MODE_LINES.get(self.mode, MODE_LINES["empathize"])
        banned = "、".join(self.recent_patterns)
        extra = f"不要再用这些说法：{banned}。" if banned else ""
        return (
            "这一通电话里前面的具体事情还在。先让对方感到被听见，并连上前面说过的一件事。"
            "不要每次都用 It sounds like、What I'm hearing is、I understand how you feel、"
            "Thank you for sharing、听起来你、我理解你的感受。"
            + line
            + extra
            + "不要把这一轮变成心理问卷。"
        )


def _is_continuing(text: str) -> bool:
    start = text.strip()[:8]
    return start.startswith("而且") or start.startswith("是啊") or start.startswith("对") or "然后" in start
