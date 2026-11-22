"""Create Mandarin, French and Spanish reference wavs when they are missing.

Synthesis is not an ASR pass. The text is the later recognition reference.
Cantonese audio is never copied into the Mandarin slot.
"""

import json

import numpy as np
import soundfile as sf

from workers.common import model_dir, offline_env, prefix

TARGETS = {
    "cmn.wav": ("Chinese", "今天早上九点开门。"),
    "fr.wav": ("French", "Bonjour, je vous écoute."),
    "es.wav": ("Spanish", "Hola, te escucho."),
}


def main() -> None:
    offline_env()
    import torch
    from qwen_tts import Qwen3TTSModel

    speakers = json.loads((prefix() / "realtime" / "speakers.json").read_text(encoding="utf-8"))
    out_dir = prefix() / "samples" / "lang"
    out_dir.mkdir(parents=True, exist_ok=True)
    copies = {
        "en.wav": prefix() / "samples" / "en.wav",
        "yue.wav": prefix() / "samples" / "yue.wav",
        "ja.wav": prefix() / "samples" / "ja.wav",
        "ko.wav": prefix() / "samples" / "ko.wav",
    }
    for name, src in copies.items():
        dest = out_dir / name
        if src.exists() and not dest.exists():
            dest.write_bytes(src.read_bytes())
    needed = [item for item in TARGETS if not (out_dir / item).exists()]
    lines = ["phase: prepare_lang_samples"]
    if not needed:
        lines.append("synthesized: none")
        (prefix() / "reports" / "realtime" / "prepare_lang_samples.txt").write_text(
            "\n".join(lines) + "\n", encoding="utf-8"
        )
        print("\n".join(lines))
        return
    model = Qwen3TTSModel.from_pretrained(
        str(model_dir("Qwen3-TTS-12Hz-0.6B-CustomVoice")),
        device_map="cuda:0",
        dtype=torch.bfloat16,
    )
    for name in needed:
        language, text = TARGETS[name]
        speaker = speakers.get(language)
        if not speaker:
            lines.append(name + ": no_speaker")
            continue
        try:
            wavs, sample_rate = model.generate_custom_voice(
                text=text,
                language=language,
                speaker=speaker,
                non_streaming_mode=True,
            )
        except Exception as exc:
            lines.append(name + ": synth_failed:" + type(exc).__name__)
            continue
        audio = np.asarray(wavs[0], dtype=np.float32)
        sf.write(out_dir / name, audio, int(sample_rate))
        lines.append(name + ": written language=" + language)
    del model
    torch.cuda.empty_cache()
    report = prefix() / "reports" / "realtime" / "prepare_lang_samples.txt"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
