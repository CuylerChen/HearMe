import unittest

from workers.vad_gate import events_from_probs, gate_pcm


class VADGateTest(unittest.TestCase):
    def test_zeros_do_not_start_speech(self):
        pcm = bytes(16000 * 2)
        events = gate_pcm(pcm, frame_ms=20, prob_fn=lambda _frame: 0.0)
        self.assertFalse(any(event["type"] == "speech_start" for event in events))

    def test_pulse_shorter_than_200ms_is_ignored(self):
        probs = [0.9] * 5 + [0.0] * 20
        events = events_from_probs(probs, frame_ms=20)
        self.assertFalse(any(event["type"] == "speech_start" for event in events))

    def test_speech_start_only_after_200ms(self):
        exact = events_from_probs([0.9] * 10, frame_ms=20)
        self.assertFalse(any(event["type"] == "speech_start" for event in exact))
        over = events_from_probs([0.9] * 11, frame_ms=20)
        starts = [event for event in over if event["type"] == "speech_start"]
        self.assertEqual(len(starts), 1)
        self.assertGreater(starts[0]["t_ms"], 200)

    def test_a_short_dip_does_not_end_the_turn(self):
        probs = [0.9] * 15 + [0.1] * 10 + [0.9] * 5
        events = events_from_probs(probs, frame_ms=20)
        self.assertEqual([event["type"] for event in events], ["speech_start"])

    def test_turn_ends_after_700ms_of_quiet(self):
        short = events_from_probs([0.9] * 15 + [0.0] * 34, frame_ms=20)
        self.assertNotIn("speech_end", [event["type"] for event in short])
        ended = events_from_probs([0.9] * 15 + [0.0] * 35, frame_ms=20)
        self.assertEqual([event["type"] for event in ended], ["speech_start", "speech_end"])


if __name__ == "__main__":
    unittest.main()
