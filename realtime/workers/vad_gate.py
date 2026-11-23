"""CPU speech gate. A turn starts after 200 ms of speech and ends after 700 ms of quiet."""

START_MS = 200
END_MS = 700
THRESHOLD = 0.5


class Gate:
    def __init__(self) -> None:
        self.speech_ms = 0
        self.silence_ms = 0
        self.started = False
        self.t_ms = 0

    def push(self, prob: float, frame_ms: int, session_id: str = "s1") -> list[dict]:
        self.t_ms += frame_ms
        if prob >= THRESHOLD:
            self.silence_ms = 0
            self.speech_ms += frame_ms
            if not self.started and self.speech_ms > START_MS:
                self.started = True
                return [{"type": "speech_start", "session_id": session_id, "t_ms": self.t_ms}]
            return []
        if not self.started:
            self.speech_ms = 0
            return []
        self.silence_ms += frame_ms
        if self.silence_ms < END_MS:
            return []
        self.started = False
        self.speech_ms = 0
        self.silence_ms = 0
        return [{"type": "speech_end", "session_id": session_id, "t_ms": self.t_ms}]


def events_from_probs(probs, frame_ms: int, session_id: str = "s1") -> list[dict]:
    gate = Gate()
    events = []
    for prob in probs:
        events.extend(gate.push(float(prob), frame_ms, session_id))
    return events


def gate_pcm(pcm: bytes, frame_ms: int = 20, prob_fn=None, session_id: str = "s1") -> list[dict]:
    if prob_fn is None:
        raise ValueError("prob_fn is required")
    samples_per_frame = int(16000 * frame_ms / 1000)
    bytes_per_frame = samples_per_frame * 2
    if bytes_per_frame <= 0:
        return []
    probs = []
    for offset in range(0, len(pcm) - bytes_per_frame + 1, bytes_per_frame):
        frame = pcm[offset : offset + bytes_per_frame]
        probs.append(float(prob_fn(frame)))
    return events_from_probs(probs, frame_ms, session_id=session_id)
