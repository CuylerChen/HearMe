"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

export default function AccountPage() {
  const { t, user, setUser } = useApp();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!user) return <AppFrame><p /></AppFrame>;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  }

  async function removeAccount() {
    await fetch("/api/account", { method: "DELETE" });
    setUser(null);
    router.push("/");
  }

  return (
    <AppFrame>
      <section className="stack">
        <h1>{t.account}</h1>
        <section className="soft-card">
          <strong>{user.email}</strong>
          <p>{t.listenerStays}</p>
          <button className="button-secondary" type="button" onClick={signOut}>{t.signOut}</button>
        </section>
        <section className="soft-card">
          <h2>{t.privacy}</h2>
          <p>{t.privacyLead}</p>
          <p>{t.notTherapy}</p>
          {confirmDelete ? (
            <>
              <p>{t.deleteConfirm}</p>
              <div className="row">
                <button className="button-secondary" type="button" onClick={() => setConfirmDelete(false)}>{t.cancel}</button>
                <button className="button-danger" type="button" onClick={removeAccount}>{t.deleteAccount}</button>
              </div>
            </>
          ) : (
            <button className="button-quiet" type="button" onClick={() => setConfirmDelete(true)}>{t.deleteAccount}</button>
          )}
        </section>
      </section>
    </AppFrame>
  );
}
