import unittest

from workers.persona import Talk, build_messages, remember, sample_kwargs, strip_think


class PersonaTest(unittest.TestCase):
    def test_spoken_prompt_avoids_service_voice(self):
        messages = build_messages("今天有点累", "Chinese", {"listen_more": True}, [])
        system = messages[0]["content"]
        self.assertIn("口语", system)
        self.assertIn("亲切", system)
        self.assertIn("不是心理治疗", system)
        self.assertIn("不要给建议", system)
        self.assertNotIn("作为AI", messages[-1]["content"])
        self.assertEqual(messages[-1]["content"], "今天有点累")

    def test_role_is_a_listener_who_eases_stress_and_loneliness(self):
        system = build_messages("今天有点累", "Chinese", {"listen_more": True}, [])[0]["content"]
        self.assertIn("倾听者", system)
        self.assertIn("陪伴者", system)
        self.assertIn("缓解压力", system)
        self.assertIn("孤独", system)
        self.assertIn("失落", system)
        self.assertIn("舒适", system)
        self.assertIn("还有人在陪", system)
        self.assertIn("不是心理治疗", system)

    def test_supplied_thread_is_used_even_if_local_memory_is_empty(self):
        from workers.persona import load_thread

        talk = Talk()
        load_thread(talk, [{"role": "user", "content": "今天被领导当众说了一顿"}, {"role": "assistant", "content": "当众那一下挺难堪的。"}], ["今天被领导当众说了一顿"])
        messages = talk.messages("回家也不想说话", "Chinese", {"listen_more": True})
        self.assertIn("当众", messages[0]["content"])
        self.assertEqual(messages[1]["content"], "今天被领导当众说了一顿")

    def test_this_call_keeps_the_thread(self):
        talk = Talk()
        talk.add("今天被领导当众说了一顿", "当众那一下挺难堪的。")
        messages = talk.messages("回家也不想说话", "Chinese", {"listen_more": True})
        system = messages[0]["content"]
        self.assertIn("这场谈话还在", system)
        self.assertIn("前面说过的还在", system)
        self.assertNotIn("只能重复", system)
        self.assertEqual(messages[-1]["content"], "回家也不想说话")
        talk.note_user("我妈昨天又打电话来了")
        later = talk.messages("我没接", "Chinese", {})
        self.assertIn("我妈昨天又打电话来了", later[0]["content"])

    def test_does_not_invent_what_the_person_did_not_say(self):
        talk = Talk()
        talk.add("今天被领导当众说了一顿", "当众那一下挺难堪的。")
        messages = talk.messages("回家也不想说话", "Chinese", {"listen_more": True})
        blob = messages[0]["content"] + "\n" + messages[-1]["content"]
        self.assertIn("倾听", blob)
        self.assertIn("陪伴", blob)
        self.assertIn("没说过", blob)
        self.assertNotIn("必须连上", blob)
        self.assertNotIn("要带上其中一件具体的事", blob)
        first = build_messages("今天有点累", "Chinese", {"listen_more": True}, [])
        self.assertIn("倾听", first[0]["content"])
        self.assertIn("陪伴", first[0]["content"])
        self.assertIn("没说过", first[0]["content"])

    def test_stays_with_this_conversation_until_it_ends(self):
        talk = Talk()
        talk.add("今天被领导当众说了一顿", "当众那一下挺难堪的。")
        messages = talk.messages("回家也不想说话", "Chinese", {"listen_more": True})
        system = messages[0]["content"]
        self.assertIn("不记得上一次", build_messages("你好", "Chinese", {}, [])[0]["content"])
        self.assertIn("这场谈话", system)
        self.assertIn("你记得对方已经说过", system)
        self.assertIn("当众", system)
        self.assertIn("不要另起话题", system)
        self.assertEqual(messages[-1]["content"], "回家也不想说话")
        self.assertEqual(messages[1]["content"], "今天被领导当众说了一顿")
        self.assertNotIn("只能重复", messages[0]["content"])
        talk.clear()
        after = talk.messages("另一件新事", "Chinese", {})
        self.assertNotIn("当众", after[0]["content"])

    def test_history_stays_in_memory_and_is_capped(self):
        history = []
        for i in range(5):
            history = remember(history, f"u{i}", f"a{i}")
        self.assertLessEqual(len(history), 6)
        self.assertEqual(history[-1]["content"], "a4")
        messages = build_messages("现在呢", "Chinese", {}, history)
        self.assertEqual(messages[-1]["role"], "user")
        self.assertEqual(messages[-1]["content"], "现在呢")
        self.assertTrue(any(item["content"] == "a4" for item in messages))

    def test_listeners_are_different_people(self):
        quiet = build_messages("今天有点累", "Chinese", {}, [], None, {"name": "林晚", "manner": "你话很少，先停一停。"})
        plain = build_messages("今天有点累", "Chinese", {}, [], None, {"name": "顾清", "manner": "你说话直，不用安慰套话。"})
        self.assertIn("林晚", quiet[0]["content"])
        self.assertIn("顾清", plain[0]["content"])
        self.assertNotEqual(quiet[0]["content"], plain[0]["content"])
        self.assertIn("不是所有用户共用的同一个助手", quiet[0]["content"])

    def test_sampling_is_on_for_conversation(self):
        self.assertTrue(sample_kwargs(True)["do_sample"])
        self.assertFalse(sample_kwargs(False)["do_sample"])

    def test_think_tags_are_not_spoken(self):
        self.assertEqual(strip_think("<think>plan</think>嗯，听着挺沉的。"), "嗯，听着挺沉的。")


if __name__ == "__main__":
    unittest.main()
