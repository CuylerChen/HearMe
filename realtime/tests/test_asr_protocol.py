import unittest

from workers.asr_protocol import CancelGate, encode_partial


class ASRProtocolTest(unittest.TestCase):
    def test_encode_partial_fields(self):
        msg = encode_partial("s1", "你好", "Chinese")
        self.assertEqual(
            msg,
            {
                "type": "partial",
                "session_id": "s1",
                "text": "你好",
                "language": "Chinese",
            },
        )

    def test_cancel_drops_later_partial(self):
        gate = CancelGate()
        gate.mark_cancelled("s1")
        self.assertFalse(gate.allow("s1"))
        self.assertIsNone(gate.filter_partial(encode_partial("s1", "leak", "Chinese")))
        kept = gate.filter_partial(encode_partial("s2", "ok", "English"))
        self.assertEqual(kept["text"], "ok")

    def test_reset_allows_next_turn_on_same_session(self):
        gate = CancelGate()
        gate.mark_cancelled("s1")
        self.assertFalse(gate.allow("s1"))
        gate.reset("s1")
        self.assertTrue(gate.allow("s1"))


if __name__ == "__main__":
    unittest.main()
