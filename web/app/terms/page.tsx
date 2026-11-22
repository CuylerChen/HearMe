"use client";

import { PublicFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

export default function TermsPage() {
  const { t } = useApp();
  return (
    <PublicFrame>
      <article>
        <h1>{t.terms}</h1>
        <p>{t.termsBody}</p>
      </article>
    </PublicFrame>
  );
}
