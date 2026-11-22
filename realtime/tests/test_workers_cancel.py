import unittest

from workers.cancel import CancelSet


class WorkerCancelTest(unittest.TestCase):
    def test_mark_cancelled_stops_emit(self):
        gate = CancelSet()
        gate.mark_cancelled("r1")
        self.assertFalse(gate.should_emit("r1"))
        self.assertTrue(gate.should_emit("r2"))


if __name__ == "__main__":
    unittest.main()
