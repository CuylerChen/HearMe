"""In-process cancel set shared by LLM and TTS workers."""


class CancelSet:
    def __init__(self) -> None:
        self._ids: set[str] = set()

    def mark_cancelled(self, request_id: str) -> None:
        self._ids.add(request_id)

    def should_emit(self, request_id: str) -> bool:
        return request_id not in self._ids
