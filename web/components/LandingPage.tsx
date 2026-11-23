"use client";

import { useRouter } from "next/navigation";
import { unlockAudio } from "@/lib/audio-unlock";
import Link from "next/link";
import { useApp } from "@/components/AppState";

export function LandingPage() {
  const { t, user } = useApp();
  const router = useRouter();
  const href = !user ? "/signup?next=/session" : user.preferences.onboardingDone ? "/session" : "/onboarding?next=/session";
  const answers = [
    [t.faqWhat, t.faqWhatBody],
    [t.faqTherapy, t.faqTherapyBody],
    [t.faqKeep, t.faqKeepBody],
    [t.faqLanguages, t.faqLanguagesBody],
    [t.faqVoice, t.faqVoiceBody],
  ];
  return (
    <div className="market">
      <header className="market-top">
        <Link className="brand" href="/"><span className="ring" aria-hidden="true" />HearMe AI</Link>
        {user ? <Link className="avatar" href="/home" aria-label={t.home}>{user.email.slice(0, 1).toUpperCase()}</Link> : <Link className="login-pill" href="/login" data-track="login">{t.login}</Link>}
      </header>
      <main>
        <section className="market-hero">
          <div>
            <h1>{t.tagline}</h1>
            <p className="lede">{t.subtitle}</p>
            <button className="button" type="button" data-track="start_talking" onClick={async () => { await unlockAudio(); router.push(href); }}>
              <MicIcon /> {t.startTalking}
            </button>
            <p className="support">{t.gentleLine}</p>
          </div>
          <aside className="phone-preview" aria-hidden="true">
            <div className="preview-head">
              <strong>HearMe</strong>
              <span>{t.voiceLabel}: {t.gentle}</span>
            </div>
            <div className="rings"><span><i className="wave"><b /><b /><b /><b /></i></span></div>
            <b>{t.listening}</b>
            <small>{t.listeningBody}</small>
            <div className="preview-actions"><i className="mic" /><i className="end">×</i></div>
          </aside>
        </section>
        <section className="feature-row">
          <article>
            <span className="feat-icon" aria-hidden="true"><MicIcon /></span>
            <h2>{t.voiceFirst}</h2>
            <p>{t.voiceFirstBody}</p>
          </article>
          <article>
            <span className="feat-icon" aria-hidden="true"><ListenIcon /></span>
            <h2>{t.listenFirst}</h2>
            <p>{t.listenFirstBody}</p>
          </article>
          <article>
            <span className="feat-icon" aria-hidden="true"><LockIcon /></span>
            <h2>{t.privacyByDesign}</h2>
            <p>{t.privacyBody}</p>
          </article>
        </section>
        <section className="privacy-banner">
          <div>
            <strong>{t.staysMoment}</strong>
            <p>{t.notTherapy}</p>
          </div>
          <Link href="/privacy" data-track="privacy">{t.howPrivacy}</Link>
        </section>
        <section className="faq" id="answers" aria-labelledby="faq-title">
          <h2 id="faq-title">{t.faqTitle}</h2>
          {answers.map(([question, answer]) => (
            <article key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="market-foot">
        <span>HearMe AI. {t.tagline}</span>
        <span className="foot-links"><Link href="/listen">Someone to talk to</Link><Link href="/zh">想找人说说话</Link><Link href="/privacy">{t.privacy}</Link><Link href="/terms">{t.terms}</Link><Link href="/contact">{t.contact}</Link></span>
      </footer>
    </div>
  );
}

function MicIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" /></svg>;
}
function ListenIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Zm16 0v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" /></svg>;
}
function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}
