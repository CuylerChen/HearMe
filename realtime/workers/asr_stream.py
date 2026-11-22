"""0.5s streaming ASR.

qwen_asr 0.0.6 exposes streaming_transcribe, and that method refuses every
backend except vLLM. vLLM is not installed and must not be installed.
When the official call raises that error, this adapter keeps the same
chunk size and state.text contract and decodes with the installed
transformers transcribe().
"""

from types import SimpleNamespace

import numpy as np

CHUNK_SIZE_SEC = 0.5
SAMPLE_RATE = 16000


class StreamingSession:
    def __init__(self, model, language=None, chunk_size_sec: float = CHUNK_SIZE_SEC):
        self.model = model
        self.language = language or None
        self.chunk_size_sec = float(chunk_size_sec)
        self.chunk_samples = max(1, int(round(self.chunk_size_sec * SAMPLE_RATE)))
        self.buffer = np.zeros((0,), dtype=np.float32)
        self.audio_accum = np.zeros((0,), dtype=np.float32)
        self.text = ""
        self.detected_language = language or ""
        self.backend = ""
        self._state = None

    def start(self) -> None:
        try:
            self._state = self.model.init_streaming_state(
                language=self.language,
                chunk_size_sec=self.chunk_size_sec,
            )
            self.backend = "qwen_asr.streaming_transcribe"
        except ValueError as exc:
            if "vllm" not in str(exc).lower():
                raise
            self.backend = "transformers_chunked_transcribe"
            self._state = None

    def push_pcm16(self, pcm_int16: np.ndarray) -> None:
        audio = np.asarray(pcm_int16)
        if audio.dtype == np.int16:
            audio = audio.astype(np.float32) / 32768.0
        else:
            audio = audio.astype(np.float32, copy=False)
        audio = np.reshape(audio, (-1,))
        if self._state is not None:
            self.model.streaming_transcribe(audio, self._state)
            self.text = self._state.text or ""
            self.detected_language = self._state.language or self.detected_language
            return
        if audio.size:
            self.buffer = np.concatenate([self.buffer, audio])
        self._consume(flush_tail=False)

    def finish(self) -> None:
        if self._state is not None:
            self.model.finish_streaming_transcribe(self._state)
            self.text = self._state.text or ""
            self.detected_language = self._state.language or self.detected_language
            return
        self._consume(flush_tail=True)

    def _consume(self, flush_tail: bool) -> None:
        progressed = False
        while self.buffer.shape[0] >= self.chunk_samples:
            chunk = self.buffer[: self.chunk_samples]
            self.buffer = self.buffer[self.chunk_samples :]
            self.audio_accum = np.concatenate([self.audio_accum, chunk])
            progressed = True
            self._transcribe_accum()
        if flush_tail and self.buffer.shape[0] > 0:
            self.audio_accum = np.concatenate([self.audio_accum, self.buffer])
            self.buffer = np.zeros((0,), dtype=np.float32)
            progressed = True
            self._transcribe_accum()
        if not progressed and flush_tail and self.audio_accum.shape[0] == 0:
            self.text = ""

    def _transcribe_accum(self) -> None:
        if self.audio_accum.shape[0] == 0:
            return
        results = self.model.transcribe((self.audio_accum, SAMPLE_RATE), language=self.language)
        if not results:
            return
        item = results[0]
        if isinstance(item, SimpleNamespace) or hasattr(item, "text"):
            self.text = item.text or ""
            self.detected_language = getattr(item, "language", None) or self.language or ""
