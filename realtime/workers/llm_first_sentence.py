"""Time the first semantic fragment from a fixed probe prompt."""

import time

from workers.common import gpu_mib, model_dir, offline_env, report_dir
from workers.splitter import push_token

PROMPT = "用一句话回答：今天天气不错。"


def main() -> None:
    offline_env()
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
    import threading

    path = str(model_dir("Qwen3-4B-AWQ"))
    tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(path, device_map="cuda:0", local_files_only=True)
    messages = [{"role": "user", "content": PROMPT}]
    try:
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
    except TypeError:
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda:0")
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
    gen_kwargs = {
        "input_ids": inputs["input_ids"],
        "max_new_tokens": 32,
        "do_sample": False,
        "streamer": streamer,
    }
    if "attention_mask" in inputs:
        gen_kwargs["attention_mask"] = inputs["attention_mask"]
    torch.cuda.synchronize()
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    worker = threading.Thread(target=model.generate, kwargs=gen_kwargs)
    worker.start()
    buf = ""
    first_ms = None
    count = 0
    for piece in streamer:
        parts, buf = push_token(buf, piece)
        if parts and first_ms is None:
            first_ms = int((time.perf_counter() - started) * 1000)
            count += len(parts)
    worker.join()
    torch.cuda.synchronize()
    total_ms = int((time.perf_counter() - started) * 1000)
    if buf.strip():
        count += 1
        if first_ms is None:
            first_ms = total_ms
    lines = [
        "phase: llm_first_sentence",
        "persona: no",
        "max_new_tokens: 32",
        "do_sample: false",
        "first_sentence_ms: " + str(first_ms if first_ms is not None else -1),
        "total_ms: " + str(total_ms),
        "sentence_count: " + str(count),
        "peak_mib: " + str(gpu_mib()),
    ]
    del model
    torch.cuda.empty_cache()
    lines.append("gpu_after_mib: " + str(gpu_mib()))
    report = report_dir() / "llm_first_sentence.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    if count < 1:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
