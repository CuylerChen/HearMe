"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useApp } from "@/components/AppState";
import { AuthSplit } from "@/components/Frames";

function SignupForm() {
  const { t, locale, setUser } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.invalidEmail);
      return;
    }
    if (password.length < 8) {
      setError(t.passwordShort);
      return;
    }
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, locale }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error === "email_taken" ? t.emailTaken : t.invalidEmail);
      return;
    }
    setUser(body.user);
    router.push(`/onboarding?next=${encodeURIComponent(next)}`);
  }

  return (
    <AuthSplit>
      <p className="brand auth-mobile-brand"><span className="ring" aria-hidden="true" />HearMe</p>
      <form className="phone-form" onSubmit={submit}>
        <h1>{t.createSpace}</h1>
        <p className="lede">{t.createSpaceHelp}</p>
        <label>{t.email}<input type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="password-field">{t.password}
          <input type={show ? "text" : "password"} placeholder={t.passwordHint} autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="eye" type="button" onClick={() => setShow((value) => !value)} aria-label={show ? t.hidePassword : t.showPassword}><EyeIcon /></button>
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button big" type="submit" data-track="create_account">{t.createAccount}</button>
        <p className="or"><span>{t.or}</span></p>
        <button className="button-secondary big" type="button" data-track="continue_google" onClick={() => setError(t.googleUnavailable)}>{t.continueGoogle}</button>
        <p className="login-line">{t.hasAccount} <Link href="/login">{t.login}</Link></p>
        <p className="fine">{t.agree}</p>
      </form>
    </AuthSplit>
  );
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
