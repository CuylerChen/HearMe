"""Probe speakers, then time the first semantic TTS fragment.

non_streaming_mode=False only simulates streaming text. It does not emit
audio chunks, so this script synthesizes the first split_sentences fragment
with non_streaming_mode=True. The 0.6B model does not accept instruct.
"""

import json
import time

from workers.common import gpu_mib, model_dir, offline_env, prefix, report_dir
from workers.splitter import split_sentences

PROBE = "今天天气不错，适合出去走走。"
NATIVE = {
    "Chinese": "Vivian",
    "English": "Ryan",
    "Japanese": "Ono_Anna",
    "Korean": "Sohee",
}
WANTED = ["Chinese", "English", "Cantonese", "Japanese", "Korean", "French", "Spanish"]
PROBE_TEXT = {
    "Chinese": "好。",
    "English": "Hi.",
    "Cantonese": "好。",
    "Japanese": "はい。",
    "Korean": "네.",
    "French": "Oui.",
    "Spanish": "Sí.",
}


def canonical(name: str) -> str:
    table = {item.lower(): item for item in WANTED}
    return table.get(name.strip().lower(), name.strip())


def main() -> None:
    offline_env()
    import torch
    from qwen_tts import Qwen3TTSModel

    before = gpu_mib()
    model = Qwen3TTSModel.from_pretrained(
        str(model_dir("Qwen3-TTS-12Hz-0.6B-CustomVoice")),
        device_map="cuda:0",
        dtype=torch.bfloat16,
    )
    speakers = model.get_supported_speakers() or []
    languages = [canonical(item) for item in (model.get_supported_languages() or [])]
    speaker_set = {item.lower(): item for item in speakers}
    mapping = {}
    failures = []
    for language in WANTED:
        if language not in languages and language.lower() not in {item.lower() for item in languages}:
            failures.append(language + ":language_unsupported")
            continue
        native = NATIVE.get(language)
        speaker = None
        if native and native.lower() in speaker_set:
            speaker = speaker_set[native.lower()]
        elif speaker_set:
            speaker = next(iter(speaker_set.values()))
        if not speaker:
            failures.append(language + ":no_speaker")
            continue
        try:
            model.generate_custom_voice(
                text=PROBE_TEXT[language],
                language=language,
                speaker=speaker,
                non_streaming_mode=True,
            )
        except Exception:
            failures.append(language + ":probe_failed")
            continue
        mapping[language] = speaker

    out = prefix() / "realtime" / "speakers.json"
    out.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    parts = split_sentences(PROBE)
    first = parts[0] if parts else PROBE
    speaker = mapping.get("Chinese")
    lines = [
        "phase: tts_first_packet",
        "non_streaming_mode_false_emits_audio_chunks: no",
        "instruct_used: no",
        "gpu_before_mib: " + str(before),
        "supported_speaker_count: " + str(len(speakers)),
        "mapped_languages: " + ",".join(mapping.keys()),
        "unmapped: " + ",".join(failures),
    ]
    if not speaker:
        lines.append("result: fail")
        lines.append("reason: chinese_speaker_missing")
    else:
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        started = time.perf_counter()
        wavs, sample_rate = model.generate_custom_voice(
            text=first,
            language="Chinese",
            speaker=speaker,
            non_streaming_mode=True,
        )
        torch.cuda.synchronize()
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        audio_ms = int(len(wavs[0]) / float(sample_rate) * 1000)
        lines.extend(
            [
                "result: recorded",
                "first_packet_ms: " + str(elapsed_ms),
                "audio_ms: " + str(audio_ms),
                "sample_rate: " + str(int(sample_rate)),
                "peak_mib: " + str(gpu_mib()),
            ]
        )
    del model
    torch.cuda.empty_cache()
    lines.append("gpu_after_mib: " + str(gpu_mib()))
    report = report_dir() / "tts_first_packet.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
