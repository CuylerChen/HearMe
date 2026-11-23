"""ASR socket messages. Transcript text stays in the message, never in logs."""


def encode_partial(session_id: str, text: str, language: str) -> dict:
    return {
        "type": "partial",
        "session_id": session_id,
        "text": text,
        "language": language,
    }


def encode_final(session_id: str, text: str, language: str) -> dict:
    return {
        "type": "final",
        "session_id": session_id,
        "text": text,
        "language": language,
    }


class CancelGate:
    def __init__(self) -> None:
        self._cancelled: set[str] = set()

    def mark_cancelled(self, session_id: str) -> None:
        self._cancelled.add(session_id)

    def reset(self, session_id: str) -> None:
        self._cancelled.discard(session_id)

    def allow(self, session_id: str) -> bool:
        return session_id not in self._cancelled

    def filter_partial(self, message: dict):
        if not self.allow(message.get("session_id", "")):
            return None
        return message
