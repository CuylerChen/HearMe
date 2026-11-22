import unittest
from types import SimpleNamespace

import numpy as np

from workers.asr_stream import CHUNK_SIZE_SEC, StreamingSession


class FakeTransformersModel:
    def __init__(self):
        self.calls = 0

    def init_streaming_state(self, **kwargs):
        raise ValueError("Streaming ASR is supported only for vLLM backend (backend='vllm').")

    def transcribe(self, audio, language=None):
        self.calls += 1
        return [SimpleNamespace(text="今天", language=language or "Chinese")]


class ASRStreamFallbackTest(unittest.TestCase):
    def test_chunk_size_is_half_second(self):
        self.assertEqual(CHUNK_SIZE_SEC, 0.5)

    def test_installed_api_falls_back_without_installing_vllm(self):
        model = FakeTransformersModel()
        session = StreamingSession(model, "Chinese")
        session.start()
        self.assertEqual(session.backend, "transformers_chunked_transcribe")
        session.push_pcm16(np.zeros(8000, dtype=np.int16))
        session.finish()
        self.assertEqual(session.text, "今天")
        self.assertGreaterEqual(model.calls, 1)


if __name__ == "__main__":
    unittest.main()
