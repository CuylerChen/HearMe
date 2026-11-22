"use client";

import { unlockAudio } from "@/lib/audio-unlock";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/components/AppState";

function OnboardingFlow() {
  const { t, setUser } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const [step, setStep] = useState(0);

  async function finish() {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onboardingDone: true }),
    });
    if (response.ok) {
      const body = await response.json();
      setUser(body.user);
    }
    router.push(next);
  }

  return (
    <main className="phone center-phone">
      <div className="progress" aria-label={`${step + 1} of 3`}>
        {[0, 1, 2].map((item) => <i key={item} className={item === step ? "on" : item < step ? "done" : ""} />)}
        <span>{step + 1} of 3</span>
      </div>
      {step === 1 ? (
        <div className="mic-orb" aria-hidden="true"><span /></div>
      ) : <div className="rings" aria-hidden="true"><span /></div>}
      <h1>{step === 0 ? t.welcomeTitle : step === 1 ? t.letHear : t.readyTitle}</h1>
      <p>{step === 1 ? `${t.micBody} ${t.micUsed}` : step === 0 ? t.welcomeBody : t.readyTalk}</p>
      {step < 2 ? (
        <button className="button big" type="button" onClick={() => setStep(step + 1)}>{step === 1 ? t.enableMic : t.continue}</button>
      ) : (
        <button className="button big" type="button" onClick={async () => { await unlockAudio(); finish(); }}>{t.startTalking}</button>
      )}
      {step === 1 ? <button className="text-action" type="button" onClick={() => setStep(2)}>{t.notNow}</button> : null}
    </main>
  );
}

export default function OnboardingPage() {
  return <Suspense><OnboardingFlow /></Suspense>;
}
