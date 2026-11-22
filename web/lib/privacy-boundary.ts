const FORBIDDEN = new Set([
  "text",
  "transcript",
  "audio",
  "pcm",
  "pcm_b64",
  "pcm16k_b64",
  "summary",
  "recording",
  "note",
  "detectedHistory",
  "detected_history",
  "languageHistory",
]);

export function rejectContentFields(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN.has(key)) return "content_not_allowed";
  }
  return null;
}
