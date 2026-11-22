import os
import tempfile
import unittest
from pathlib import Path

from workers.privacy import redact_event, wipe_session


class PrivacyTest(unittest.TestCase):
    def test_redact_event_drops_content_fields(self):
        event = {
            "type": "audio",
            "session_id": "s1",
            "text": "隐私探针句子",
            "pcm_b64": "AAAA",
            "audio": "raw",
            "latency_ms": 12,
        }
        cleaned = redact_event(event)
        self.assertNotIn("text", cleaned)
        self.assertNotIn("pcm_b64", cleaned)
        self.assertNotIn("audio", cleaned)
        self.assertEqual(cleaned["session_id"], "s1")
        self.assertEqual(cleaned["latency_ms"], 12)
        self.assertIn("text", event)

    def test_wipe_session_removes_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["HEARME_PREFIX"] = tmp
            session = Path(tmp) / "tmp" / "realtime" / "s1"
            session.mkdir(parents=True)
            (session / "note.txt").write_text("隐私探针句子", encoding="utf-8")
            wipe_session("s1")
            self.assertFalse(session.exists())


if __name__ == "__main__":
    unittest.main()
