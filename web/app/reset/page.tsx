"use client";

import { FormEvent, useState } from "react";
import { PublicFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

export default function ResetPage() {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(t.notFound);
      return;
    }
    setIssued(body.code);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError(t.passwordShort);
      return;
    }
    const response = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    if (!response.ok) {
      setError(t.invalidCode);
      return;
    }
    setDone(true);
  }

  return (
    <PublicFrame>
      <form className="panel form" onSubmit={issued ? save : requestCode}>
        <h1>{t.resetTitle}</h1>
        <p className="help">{t.resetHelp}</p>
        <label>{t.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {issued ? (
          <>
            <p className="notice">{t.resetCodeNote}</p>
            <p><strong>{issued}</strong></p>
            <label>Code<input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
            <label>{t.newPassword}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          </>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        {done ? <p>{t.done}</p> : <button className="button" type="submit">{issued ? t.savePassword : t.continue}</button>}
      </form>
    </PublicFrame>
  );
}
