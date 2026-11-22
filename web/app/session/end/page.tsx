"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppState";

const levels = [1, 2, 3, 4, 5];

export default function SessionEndPage() {
  const { t } = useApp();
  const router = useRouter();
  const [level, setLevel] = useState(0);
  const names = [t.veryLow, t.low, t.okay, t.good, t.veryGood];

  async function saveMood() {
    if (!level) return;
    await fetch("/api/mood", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), level }),
    });
  }

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendFeedback(rating: number) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    if (response.ok) setSent(true);
  }

  return (
    <main className="thanks">
      <header className="thanks-top">
        <span className="brand"><span className="ring" aria-hidden="true" />HearMe</span>
      </header>
      <div className="check" aria-hidden="true">✓</div>
      <h1>{t.thanksTitle}</h1>
      <p className="lede">{t.thanksBody}</p>
      <section className="soft-card mood-card">
        <h2>{t.feelingNow}</h2>
        <p>{t.moodOnlyNumber}</p>
        <div className="mood-picks" role="radiogroup" aria-label={t.feelingNow}>
          {levels.map((item) => (
            <button key={item} className={level === item ? "pick on" : "pick"} type="button" role="radio" aria-checked={level === item} onClick={() => setLevel(item)}>
              <i className={`d${item}`} aria-hidden="true" />
              {names[item - 1]}
            </button>
          ))}
        </div>
        <button className="text-action skip" type="button" onClick={() => router.push("/home")}>{t.skip}</button>
      </section>
      <button className="button big" type="button" onClick={async () => { await saveMood(); router.push("/home"); }}>{t.backHome}</button>
      {sent ? <p className="fine">{t.feedbackSent}</p> : feedbackOpen ? (
        <div className="rate-row" role="group" aria-label={t.rateProduct}>
          {levels.map((item) => (
            <button key={item} type="button" onClick={() => sendFeedback(item)}>{item}</button>
          ))}
        </div>
      ) : (
        <button className="feedback-link" type="button" onClick={() => setFeedbackOpen(true)}>{t.shareFeedback}</button>
      )}
    </main>
  );
}
