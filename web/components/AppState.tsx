"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { detectLocale, messages } from "@/lib/messages";
import type { Locale, PublicUser } from "@/lib/types";

type AppContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  user: PublicUser | null;
  setUser: (user: PublicUser | null) => void;
  ready: boolean;
  refresh: () => Promise<void>;
  t: (typeof messages)["en"];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppState({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      setUser(null);
      return;
    }
    const body = await response.json();
    setUser(body.user);
    if (body.user?.preferences?.interfaceLocale) setLocaleState(body.user.preferences.interfaceLocale);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("hearme_locale") as Locale | null;
    setLocaleState(saved && messages[saved] ? saved : detectLocale(navigator.language));
    refresh().finally(() => setReady(true));
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem("hearme_locale", next);
  }

  const value = useMemo(
    () => ({ locale, setLocale, user, setUser, ready, refresh, t: messages[locale] }),
    [locale, user, ready],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("missing app state");
  return value;
}
