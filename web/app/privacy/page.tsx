"use client";

import { PublicFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

export default function PrivacyPage() {
  const { t } = useApp();
  return (
    <PublicFrame>
      <article className="stack">
        <h1>{t.privacy}</h1>
        <p>{t.privacyLead}</p>
        <p>{t.privacyItems}</p>
        <p>{t.privacyVoice}</p>
        <p>{t.notTherapy}</p>
      </article>
    </PublicFrame>
  );
}
