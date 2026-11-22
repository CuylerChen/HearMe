#!/bin/bash
# Download Silero VAD ONNX into the HearMe prefix. No apt, no GPU.
set -euo pipefail
PREFIX=/bigdata/hearme-ai
DEST="$PREFIX/models/silero_vad/silero_vad.onnx"
if [[ -s "$DEST" ]]; then
  echo "silero already present"
  exit 0
fi
mkdir -p "$PREFIX/models/silero_vad"
tmp="$PREFIX/tmp/silero_vad.onnx"
rm -f "$tmp"
urls=(
  "https://www.modelscope.cn/models/manyeyes/silero-vad-onnx/resolve/master/silero_vad.onnx"
  "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
)
for url in "${urls[@]}"; do
  echo "try $url"
  if "$PREFIX/bin/with-dns" curl -fsSL --retry 2 --max-time 120 -o "$tmp" "$url"; then
    if [[ -s "$tmp" ]]; then
      mv "$tmp" "$DEST"
      echo "silero saved"
      exit 0
    fi
  fi
done
echo "silero download failed" | tee "$PREFIX/reports/realtime/vad.txt"
exit 1
