"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";
import { VoicePicker } from "@/components/VoicePicker";
import { LOCALES, type Locale, type Preferences, type VoiceKey } from "@/lib/types";

const localeNames: Record<Locale, string> = {
  en: "English",
  "zh-CN": "中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
};

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export default function SettingsPage() {
  const { t, user, setUser, setLocale, locale } = useApp();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  if (!user) return <AppFrame><p /></AppFrame>;
  const prefs = user.preferences;
  const voiceName = { gentle: t.gentle, calm: t.calm, warm: t.warm, thoughtful: t.thoughtful }[prefs.voiceKey];
  const voiceDesc = { gentle: t.gentleDesc, calm: t.calmDesc, warm: t.warmDesc, thoughtful: t.thoughtfulDesc }[prefs.voiceKey];
  const conversationValue = prefs.conversationLanguageMode === "auto" ? "auto" : prefs.preferredConversationLocale || "en";
  const conversationHelp = conversationValue === "auto" ? `${t.autoDetect}, ${t.autoFollows}` : localeNames[conversationValue as Locale];

  async function patch(next: Partial<Preferences>) {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) return;
    const body = await response.json();
    setUser(body.user);
    if (next.interfaceLocale) setLocale(next.interfaceLocale);
  }

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

  function toggleDay(day: string) {
    const current = prefs.reminderDays.includes(day) ? prefs.reminderDays.filter((item) => item !== day) : [...prefs.reminderDays, day];
    patch({ reminderDays: current });
  }

  return (
    <AppFrame>
      <section className="settings-page">
        <h1>{t.settingsTitle}</h1>
        <div className="settings-grid">
          <div className="settings-col">
            <p className="kicker">{t.voiceLabel}</p>
            <div className="set-card voice-summary">
              <span><strong>{voiceName}</strong><small>{voiceDesc}</small></span>
              <button type="button" className="text-action" data-track="change_voice" onClick={() => setVoiceOpen(true)}>{t.change} ›</button>
            </div>
            <p className="kicker">{t.listeningPrefs}</p>
            <div className="set-card">
              <Switch label={t.listenMore} checked={prefs.listenMore} onChange={(listenMore) => patch({ listenMore })} />
              <Switch label={t.askQuestions} checked={prefs.askQuestions} onChange={(askQuestions) => patch({ askQuestions })} />
              <Switch label={t.shortResponses} checked={prefs.shortResponses} onChange={(shortResponses) => patch({ shortResponses })} />
              <Switch label={t.gentleTone} checked={prefs.gentleTone} onChange={(gentleTone) => patch({ gentleTone })} />
            </div>
            <p className="kicker">{t.languageSection}</p>
            <div className="set-card">
              <label className="lang-row">
                <span><strong>{t.conversationLanguage}</strong><small>{conversationHelp}</small></span>
                <span className="chev" aria-hidden="true">›</span>
                <select
                  value={conversationValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "auto") patch({ conversationLanguageMode: "auto", preferredConversationLocale: null });
                    else patch({ conversationLanguageMode: "preferred", preferredConversationLocale: value as Locale });
                  }}
                >
                  <option value="auto">{t.autoDetect}</option>
                  {LOCALES.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
                </select>
              </label>
              <label className="lang-row">
                <span><strong>{t.interfaceLanguage}</strong><small>{localeNames[prefs.interfaceLocale]}. {t.interfaceSeparate}</small></span>
                <span className="chev" aria-hidden="true">›</span>
                <select value={prefs.interfaceLocale} onChange={(event) => patch({ interfaceLocale: event.target.value as Locale })}>
                  {LOCALES.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="settings-col">
            <p className="kicker">{t.reminder}</p>
            <div className="set-card reminder-card">
              <Switch label={<><strong>{t.dailyReminder}</strong><small>{prefs.reminderEnabled ? t.reminderOn : t.reminderOff}</small></>} checked={prefs.reminderEnabled} onChange={(reminderEnabled) => patch({ reminderEnabled })} />
              <p>{t.reminderCopy} {t.reminderChoose}</p>
              {prefs.reminderEnabled ? (
                <div className="reminder-extra">
                  <input type="time" value={prefs.reminderTime} onChange={(event) => patch({ reminderTime: event.target.value })} aria-label={t.reminder} />
                  <div className="day-chips">
                    {dayKeys.map((day, index) => (
                      <button key={day} type="button" className={prefs.reminderDays.includes(day) ? "on" : ""} onClick={() => toggleDay(day)}>
                        {new Date(2026, 10, 1 + index).toLocaleDateString(locale, { weekday: "short" })}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="help">{t.reminderNote}</p>
            </div>
            <p className="kicker">{t.privacy}</p>
            <div className="set-card privacy-card">
              <p><LockIcon /> {t.noHistoryLine}</p>
              <p><CloudIcon /> {t.privacyVoice}</p>
              <Link href="/privacy">{t.readPrivacy}</Link>
            </div>
            <p className="kicker">{t.account}</p>
            <div className="set-card account-card">
              <p><small>{t.email}</small><strong>{user.email}</strong></p>
              <button type="button" onClick={signOut}>{t.signOut}</button>
              <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>{t.deleteAccount}</button>
            </div>
          </div>
        </div>
        {voiceOpen ? (
          <div className="sheet-backdrop" onClick={() => setVoiceOpen(false)}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label={t.chooseVoice} onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <h2>{t.chooseVoice}</h2>
                <button type="button" className="close" onClick={() => setVoiceOpen(false)} aria-label={t.cancel}>×</button>
              </div>
              <VoicePicker value={prefs.voiceKey} onChange={(voiceKey: VoiceKey) => { patch({ voiceKey }); setVoiceOpen(false); }} />
            </div>
          </div>
        ) : null}
        {confirmDelete ? (
          <div className="dialog-backdrop">
            <div className="dialog" role="dialog" aria-modal="true">
              <p>{t.deleteConfirm}</p>
              <div className="row">
                <button className="button-secondary" type="button" onClick={() => setConfirmDelete(false)}>{t.cancel}</button>
                <button className="button-danger" type="button" onClick={removeAccount}>{t.deleteAccount}</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </AppFrame>
  );
}

function Switch({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="switch">
      <span className="switch-copy">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-ui" aria-hidden="true" />
    </label>
  );
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}
function CloudIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5-1.5A4 4 0 0 0 7 18Z" /></svg>;
}
