"""CPU speech gate. speech_start fires only after more than 200 ms of speech."""

START_MS = 200
THRESHOLD = 0.5


def events_from_probs(probs, frame_ms: int, session_id: str = "s1") -> list[dict]:
    events = []
    speech_ms = 0
    started = False
    t_ms = 0
    for prob in probs:
        t_ms += frame_ms
        if prob >= THRESHOLD:
            speech_ms += frame_ms
            if not started and speech_ms > START_MS:
                started = True
                events.append(
                    {"type": "speech_start", "session_id": session_id, "t_ms": t_ms}
                )
        else:
            if started:
                events.append(
                    {"type": "speech_end", "session_id": session_id, "t_ms": t_ms}
                )
            started = False
            speech_ms = 0
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
