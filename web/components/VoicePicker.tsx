"use client";

import { useApp } from "./AppState";
import type { VoiceKey } from "@/lib/types";

const keys: VoiceKey[] = ["gentle", "calm", "warm", "thoughtful"];

export function VoicePicker({
  value,
  onChange,
}: {
  value: VoiceKey;
  onChange: (voice: VoiceKey) => void;
}) {
  const { t } = useApp();
  const copy = {
    gentle: [t.gentle, t.gentleDesc],
    calm: [t.calm, t.calmDesc],
    warm: [t.warm, t.warmDesc],
    thoughtful: [t.thoughtful, t.thoughtfulDesc],
  } as const;
  return (
    <div className="voice-list" role="radiogroup" aria-label={t.chooseVoice}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="voice-option"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
        >
          <span className="radio" aria-hidden="true" />
          <span><strong>{copy[key][0]}</strong><small>{copy[key][1]}</small></span>
        </button>
      ))}
      <p className="help">{t.previewUnavailable}</p>
    </div>
  );
}
