"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthSplit } from "@/components/Frames";
import { useApp } from "@/components/AppState";

function LoginForm() {
  const { t, setUser } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(t.wrongPassword);
      return;
    }
    setUser(body.user);
    router.push(body.user.preferences.onboardingDone ? next : `/onboarding?next=${encodeURIComponent(next)}`);
  }

  return (
    <AuthSplit>
      <p className="brand auth-mobile-brand"><span className="ring" aria-hidden="true" />HearMe</p>
      <form className="phone-form" onSubmit={submit}>
        <h1>{t.welcomeBack}</h1>
        <p className="lede">{t.subtitle}</p>
        <label>{t.email}<input type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="password-field">{t.password}
          <input type={show ? "text" : "password"} autoComplete="current-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="eye" type="button" onClick={() => setShow((value) => !value)} aria-label={show ? t.hidePassword : t.showPassword}><EyeIcon /></button>
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button big" type="submit" data-track="login">{t.login}</button>
        <p className="login-line"><Link href="/reset">{t.forgot}</Link></p>
        <p className="fine">{t.noAccount} <Link href="/signup" data-track="signup">{t.signup}</Link></p>
      </form>
    </AuthSplit>
  );
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
