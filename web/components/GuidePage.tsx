import Link from "next/link";
import type { Guide } from "@/lib/promote";

export function GuidePage({ guide }: { guide: Guide }) {
  return (
    <div className="market guide" lang={guide.htmlLang}>
      <header className="market-top">
        <Link className="brand" href="/"><span className="ring" aria-hidden="true" />HearMe</Link>
        <span className="guide-nav">
          <Link href={guide.other.path}>{guide.other.label}</Link>
          <Link className="login-pill" href="/login">{guide.login}</Link>
        </span>
      </header>
      <main>
        <section className="market-hero">
          <div>
            <h1>{guide.h1}</h1>
            <p className="cite">{guide.answer}</p>
            <Link className="button" href="/signup?next=/session">{guide.cta}</Link>
          </div>
        </section>
        <section className="feature-row">
          {guide.sections.map((section) => (
            <article key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
        <section className="faq" id="answers" aria-labelledby="faq-title">
          <h2 id="faq-title">{guide.faqTitle}</h2>
          {guide.faqs.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="market-foot">
        <span>HearMe. {guide.h1}</span>
        <span className="foot-links">
          <Link href="/privacy">{guide.privacy}</Link>
          <Link href="/terms">{guide.terms}</Link>
          <Link href="/contact">{guide.contact}</Link>
        </span>
      </footer>
    </div>
  );
}
