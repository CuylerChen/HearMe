#!/bin/bash
# Run the realtime voice tasks on ai02-remote. Stop on the first failed gate.
set -u
PREFIX=/bigdata/hearme-ai
PY="$PREFIX/venv/bin/python"
LLM="$PREFIX/venv-llm/bin/python"
export HEARME_PREFIX="$PREFIX"
export PYTHONPATH="$PREFIX/realtime"
mkdir -p "$PREFIX/reports/realtime" "$PREFIX/samples/lang" "$PREFIX/logs"
cd "$PREFIX/realtime"

run_gpu() {
  local name="$1"
  shift
  echo "=== $name ==="
  if ! "$PREFIX/bin/gpu-guard.sh"; then
    echo "$name GPU_BUSY" | tee "$PREFIX/reports/realtime/${name}.blocked"
    return 2
  fi
  nice -n 19 ionice -c 3 "$@"
  local code=$?
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
  echo "$name gpu_after_mib=$used"
  return $code
}

echo "unit tests"
"$PY" -m unittest discover -s tests -v || exit 1

run_gpu tts_first_packet "$PY" -m workers.tts_first_packet || exit 1
run_gpu asr_stream_zh "$PY" -m workers.asr_stream_eval "$PREFIX/samples/zh.wav" Chinese asr_stream_zh.txt || exit 1
run_gpu llm_first_sentence "$LLM" -m workers.llm_first_sentence || exit 1
run_gpu tts_cancel "$PY" -m workers.tts_cancel_eval || exit 1

echo "=== vad download ==="
bash "$PREFIX/realtime/deploy/fetch-silero.sh" || bash "$PREFIX/bin/fetch-silero.sh" || true
if [[ ! -f "$PREFIX/models/silero_vad/silero_vad.onnx" ]]; then
  echo "vad_download: fail" | tee "$PREFIX/reports/realtime/vad.txt"
else
  CUDA_VISIBLE_DEVICES="" "$PY" -m unittest tests.test_vad_gate -v
  echo "vad_onnx: present" | tee "$PREFIX/reports/realtime/vad.txt"
  if nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -q .; then
    echo "vad process appeared in compute apps" | tee -a "$PREFIX/reports/realtime/vad.txt"
  else
    echo "vad_gpu_process: none" | tee -a "$PREFIX/reports/realtime/vad.txt"
  fi
fi

echo "=== languages ==="
run_gpu prepare_samples "$PY" -m workers.prepare_lang_samples || true
run_gpu lang_eval "$PY" -m workers.lang_eval || true

echo "PHASE2_SCRIPTS_DONE"
nvidia-smi --query-gpu=memory.used --format=csv,noheader
systemctl is-active nginx ollama redis docker
