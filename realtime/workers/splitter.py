"""Semantic fragment splitter.

generate_custom_voice(non_streaming_mode=False) only simulates streaming
text. Audio chunks come from calling synthesis once per fragment emitted here.
"""

STOPS = set("。！？!?")
SOFT = set("，、,")
MIN_FRAGMENT = 4
SOFT_LIMIT = 20


def _segments(text: str) -> tuple[list[str], str]:
    parts: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in STOPS or (len(buf) >= SOFT_LIMIT and ch in SOFT):
            parts.append(buf)
            buf = ""
    return parts, buf


def _merge_short(parts: list[str]) -> list[str]:
    merged: list[str] = []
    hold = ""
    for part in parts:
        piece = hold + part
        hold = ""
        if len(piece) < MIN_FRAGMENT:
            hold = piece
            continue
        merged.append(piece)
    if hold:
        if merged:
            merged[-1] += hold
        else:
            merged.append(hold)
    return merged


def split_sentences(text: str) -> list[str]:
    """Split a complete string. Incomplete tail without a stop is held back."""
    parts, _tail = _segments(text)
    return _merge_short(parts)


def push_token(buffer: str, token: str) -> tuple[list[str], str]:
    """Append one token and return newly closed fragments plus the held tail."""
    parts, tail = _segments(buffer + token)
    emitted: list[str] = []
    hold = ""
    for part in parts:
        piece = hold + part
        hold = ""
        if len(piece) < MIN_FRAGMENT:
            hold = piece
            continue
        emitted.append(piece)
    return emitted, hold + tail
