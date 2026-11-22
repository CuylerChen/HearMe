"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./AppState";

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

export function AuthSplit({ children }: { children: React.ReactNode }) {
  const { t } = useApp();
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <Link className="brand" href="/"><span className="ring" aria-hidden="true" />HearMe AI</Link>
        <div className="rings" aria-hidden="true"><span /></div>
        <h2>{t.tagline}</h2>
        <p>{t.gentleLine}</p>
        <p className="auth-aside-foot">{t.noRecordings}</p>
      </aside>
      <section className="auth-main">{children}</section>
    </div>
  );
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  const { t } = useApp();
  return (
    <div className="frame">
      <header className="topbar">
        <Link className="brand" href="/"><Logo />HearMe<span className="brand-ai">AI</span></Link>
        <nav className="nav-links" aria-label="Public">
          <Link href="/login">{t.login}</Link>
          <Link href="/signup">{t.signup}</Link>
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        <Link href="/privacy">{t.privacy}</Link>
        <Link href="/terms">{t.terms}</Link>
        <Link href="/contact">{t.contact}</Link>
      </footer>
    </div>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { t, ready, user } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <main className="page"><p>{t.loading}</p></main>;
  if (pathname.startsWith("/session")) return <>{children}</>;
  const local = user.email.split("@")[0] || user.email;
  const displayName = local.charAt(0).toUpperCase() + local.slice(1);
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <div className="app-phone">
      <aside className="desk-side">
        <Link className="brand" href="/home"><span className="ring" aria-hidden="true" />HearMe</Link>
        <nav aria-label="App">
          <Link href="/home" aria-current={pathname === "/home" ? "page" : undefined}><HomeIcon />{t.home}</Link>
          <Link href="/mood" aria-current={pathname === "/mood" ? "page" : undefined}><MoodIcon />{t.mood}</Link>
          <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><SettingsIcon />{t.settings}</Link>
        </nav>
        <Link className="side-user" href="/account">
          <span className="avatar">{initial}</span>
          <span><strong>{displayName}</strong><small>{user.email}</small></span>
        </Link>
      </aside>
      <div className="desk-main">
      <header className="phone-top">
        <Link className="brand" href="/home"><span className="ring" aria-hidden="true" />HearMe</Link>
        <Link className="avatar" href="/account" aria-label={t.account}>{initial}</Link>
      </header>
      <main className="phone-main">{children}</main>
      <nav className="tabbar" aria-label="App">
        <Link href="/home" aria-current={pathname === "/home" ? "page" : undefined}><HomeIcon />{t.home}</Link>
        <Link href="/mood" aria-current={pathname === "/mood" ? "page" : undefined}><MoodIcon />{t.mood}</Link>
        <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><SettingsIcon />{t.settings}</Link>
      </nav>
      </div>
    </div>
  );
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" /></svg>;
}
function MoodIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="8" cy="7" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
}


