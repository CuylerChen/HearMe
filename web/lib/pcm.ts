export function downsampleTo16k(input: Float32Array, sampleRate: number) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const ratio = rate / 16000;
  const length = Math.floor(input.length / ratio);
  const pcm = new Int16Array(length);
  const half = Math.max(1, Math.floor(ratio / 2));
  for (let i = 0; i < length; i += 1) {
    const center = Math.floor(i * ratio);
    const start = Math.max(0, center - half);
    const end = Math.min(input.length, center + half + 1);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

export function pcmToBase64(pcm: Int16Array) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

export function base64ToPcm(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}
