"""Stream seven language samples. Cantonese cannot satisfy the Mandarin check."""

import time

from workers.asr_stream_eval import transcribe_file
from workers.common import gpu_mib, model_dir, offline_env, prefix, report_dir

ITEMS = [
    ("cmn.wav", "Chinese", True),
    ("en.wav", "English", True),
    ("yue.wav", "Cantonese", True),
    ("ja.wav", "Japanese", True),
    ("ko.wav", "Korean", True),
    ("fr.wav", "French", True),
    ("es.wav", "Spanish", False),
]


def main() -> None:
    offline_env()
    import torch
    from qwen_asr import Qwen3ASRModel

    model = Qwen3ASRModel.from_pretrained(
        str(model_dir("Qwen3-ASR-0.6B")),
        dtype=torch.bfloat16,
        device_map="cuda:0",
        max_inference_batch_size=1,
        max_new_tokens=64,
    )
    lines = ["phase: languages"]
    launch_fail = False
    sample_dir = prefix() / "samples" / "lang"
    for name, language, launch in ITEMS:
        path = sample_dir / name
        if not path.exists():
            lines.append(f"{language}: missing file={name} nonempty=no launch={int(launch)}")
            if launch:
                launch_fail = True
            continue
        started = time.perf_counter()
        try:
            session = transcribe_file(model, str(path), language)
            text = session.text.strip()
            nonempty = bool(text)
            token = "n/a"
            ok = nonempty
            if language == "Chinese":
                token = "yes" if ("九点" in text or "開門" in text or "开门" in text or "九點" in text) else "no"
                ok = nonempty and token == "yes"
            elapsed = int((time.perf_counter() - started) * 1000)
            lines.append(
                f"{language}: nonempty={'yes' if nonempty else 'no'} mandarin_token={token} "
                f"peak_mib={gpu_mib()} wall_ms={elapsed} launch={int(launch)}"
            )
            if launch and not ok:
                launch_fail = True
        except Exception as exc:
            lines.append(f"{language}: error={type(exc).__name__} launch={int(launch)}")
            if launch:
                launch_fail = True
    del model
    torch.cuda.empty_cache()
    lines.append("gpu_after_mib: " + str(gpu_mib()))
    lines.append("launch_six_pass: " + ("no" if launch_fail else "yes"))
    lines.append("spanish_replaces_launch_language: no")
    report = report_dir() / "languages.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    if launch_fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
