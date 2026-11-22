import unittest

from workers.listening import ListeningState


class ListeningEngineTest(unittest.TestCase):
    def test_advice_request_uses_support_not_a_questionnaire(self):
        state = ListeningState()
        mode = state.choose("你觉得我应该怎么调整？")
        self.assertEqual(mode, "support")
        self.assertGreater(state.token_limit(), 32)

    def test_not_knowing_what_to_say_does_not_ask_a_question(self):
        state = ListeningState()
        mode = state.choose("我也不知道该说什么了。")
        self.assertEqual(mode, "gentle_presence")
        self.assertIn("不要提问", state.instruction())

    def test_does_not_ask_on_every_turn(self):
        state = ListeningState()
        state.choose("最近工作压力很大。")
        state.note_reply("That sounds like a lot to carry?", "empathize")
        mode = state.choose("是啊，回家以后脑子里还一直想着工作。")
        self.assertNotEqual(mode, "explore")
        self.assertIn("不要提问", state.instruction())

    def test_new_call_forgets_the_last_one(self):
        state = ListeningState()
        state.choose("昨天被领导批评了。")
        state.note_reply("那一下挺难堪的。", "empathize")
        state.clear()
        self.assertEqual(state.recent_patterns, [])
        self.assertNotIn("批评", state.instruction())

    def test_explicit_risk_in_six_languages_uses_safety_not_chat(self):
        samples = [
            "I want to kill myself",
            "我不想活了",
            "死にたい",
            "죽고 싶어",
            "quiero matarme",
            "je veux me suicider",
        ]
        for text in samples:
            state = ListeningState()
            self.assertEqual(state.choose(text), "safety", text)
            guide = state.instruction()
            self.assertIn("988", guide)
            self.assertIn("911", guide)
            self.assertNotIn("Empathize", guide)
            self.assertNotIn("不要提问", guide)

    def test_prompt_bans_template_empathy(self):
        state = ListeningState()
        state.choose("今天工作特别累，领导一直在批评我。")
        text = state.instruction()
        self.assertIn("It sounds like", text)
        self.assertIn("不要急着解决", text)
        self.assertIn("被听见", text)


if __name__ == "__main__":
    unittest.main()
