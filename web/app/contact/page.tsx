"use client";

import { PublicFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

export default function ContactPage() {
  const { t } = useApp();
  return (
    <PublicFrame>
      <article>
        <h1>{t.contact}</h1>
        <p>{t.contactBody}</p>
      </article>
    </PublicFrame>
  );
}
