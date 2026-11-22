"""Synthesize two fragments. Cancel the second before its audio is emitted."""

import json
import threading
import time

from workers.cancel import CancelSet
from workers.common import gpu_mib, model_dir, offline_env, prefix, report_dir

FIRST = "今天天气不错。"
SECOND = "适合出去走走。"


def main() -> None:
    offline_env()
    import torch
    from qwen_tts import Qwen3TTSModel

    speakers = json.loads((prefix() / "realtime" / "speakers.json").read_text(encoding="utf-8"))
    speaker = speakers.get("Chinese")
    if not speaker:
        raise SystemExit("chinese speaker missing")
    model = Qwen3TTSModel.from_pretrained(
        str(model_dir("Qwen3-TTS-12Hz-0.6B-CustomVoice")),
        device_map="cuda:0",
        dtype=torch.bfloat16,
    )
    gate = CancelSet()
    emitted = []

    def run(request_id, text):
        if not gate.should_emit(request_id):
            emitted.append(("cancelled", request_id))
            return
        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language="Chinese",
            speaker=speaker,
            non_streaming_mode=True,
        )
        if not gate.should_emit(request_id):
            emitted.append(("cancelled", request_id))
            return
        emitted.append(("audio", request_id, int(sample_rate), len(wavs[0])))

    started = time.perf_counter()
    run("r1", FIRST)
    first_ms = int((time.perf_counter() - started) * 1000)
    holder = {}

    def second():
        begun = time.perf_counter()
        holder["begun"] = begun
        run("r2", SECOND)

    thread = threading.Thread(target=second)
    thread.start()
    while "begun" not in holder:
        time.sleep(0.001)
    cancel_at = time.perf_counter()
    gate.mark_cancelled("r2")
    thread.join()
    cancel_ms = int((time.perf_counter() - cancel_at) * 1000)
    second_audio = [item for item in emitted if item[0] == "audio" and item[1] == "r2"]
    cancelled = [item for item in emitted if item[0] == "cancelled" and item[1] == "r2"]
    lines = [
        "phase: tts_cancel",
        "first_fragment_ms: " + str(first_ms),
        "cancel_response_ms: " + str(cancel_ms),
        "second_audio_messages: " + str(len(second_audio)),
        "cancelled_messages: " + str(len(cancelled)),
        "peak_mib: " + str(gpu_mib()),
    ]
    del model
    torch.cuda.empty_cache()
    lines.append("gpu_after_mib: " + str(gpu_mib()))
    report = report_dir() / "tts_cancel.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    if second_audio or not cancelled:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
