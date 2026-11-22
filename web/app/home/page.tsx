"use client";

import { unlockAudio } from "@/lib/audio-unlock";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";
import { VoicePicker } from "@/components/VoicePicker";
import type { VoiceKey } from "@/lib/types";

const labels = { gentle: "gentle", calm: "calm", warm: "warm", thoughtful: "thoughtful" } as const;

export default function HomePage() {
  const { t, user, setUser } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!user) return <AppFrame><p /></AppFrame>;
  const voice = user.preferences.voiceKey;
  const name = t[labels[voice]];

  async function choose(next: VoiceKey) {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voiceKey: next }),
    });
    if (response.ok) setUser((await response.json()).user);
    setOpen(false);
  }

  return (
    <AppFrame>
      <section className="home-screen">
        <div className="rings home-rings" aria-hidden="true"><span /></div>
        <h1>{t.homeGreeting}</h1>
        <button className="button big" type="button" data-track="start_talking" onClick={async () => { await unlockAudio(); router.push("/session"); }}>
          <MicIcon /> {t.startTalking}
        </button>
        <p className="lede">{t.subtitle}</p>
        <button className="voice-card" type="button" data-track="change_voice" onClick={() => setOpen(true)}>
          <span className="voice-ico" aria-hidden="true"><WaveIcon /></span>
          <span className="voice-copy"><small>{t.voiceLabel}</small><strong>{name}</strong></span>
          <span className="change">{t.change}</span>
        </button>
        <p className="help">{t.spaceLine}</p>
      </section>
      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="voice-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="voice-title">{t.chooseVoice}</h2>
              <button type="button" className="close" onClick={() => setOpen(false)} aria-label={t.cancel}>×</button>
            </div>
            <VoicePicker value={voice} onChange={choose} />
            <button className="button big" type="button" onClick={() => setOpen(false)}>{t.useVoice} {name}</button>
          </div>
        </div>
      ) : null}
    </AppFrame>
  );
}

function MicIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>;
}
function WaveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></svg>;
}
