import unittest

from workers.splitter import push_token, split_sentences


class SplitSentencesTest(unittest.TestCase):
    def test_split_keeps_short_clause_until_stop(self):
        self.assertEqual(split_sentences("你好"), [])
        self.assertEqual(split_sentences("你好。"), ["你好。"])

    def test_split_flushes_at_twenty_chars_on_comma(self):
        text = "今天天气很好，我们出去走走看看。"
        parts = split_sentences(text)
        self.assertTrue(parts[0].endswith("，") or parts[0].endswith("。"))
        self.assertEqual("".join(parts), text)

    def test_split_flushes_when_buffer_reaches_twenty_on_comma(self):
        text = "一二三四五六七八九十一二三四五六七八九，下一句。"
        parts = split_sentences(text)
        self.assertEqual(parts[0], "一二三四五六七八九十一二三四五六七八九，")
        self.assertGreaterEqual(len(parts[0]), 20)
        self.assertEqual("".join(parts), text)

    def test_short_fragment_merges_into_next(self):
        text = "好。我们出去走走。"
        parts = split_sentences(text)
        self.assertEqual("".join(parts), text)
        self.assertTrue(all(len(part) >= 4 for part in parts[:-1]))
        self.assertNotIn("好。", parts)


class PushTokenTest(unittest.TestCase):
    def test_push_token_emits_first_sentence_at_period(self):
        text = "今天天气不错。适合出门。"
        buf = ""
        emitted = []
        first = None
        for ch in text:
            parts, buf = push_token(buf, ch)
            if parts and first is None:
                first = parts[0]
            emitted.extend(parts)
        if buf:
            tail, buf = push_token(buf, "")
            emitted.extend(tail)
        self.assertEqual(first, "今天天气不错。")
        self.assertEqual("".join(emitted), text)
        self.assertEqual(buf, "")


if __name__ == "__main__":
    unittest.main()
