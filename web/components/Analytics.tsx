"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function device() {
  return window.innerWidth < 960 ? "mobile" : "desktop";
}

function locale() {
  return window.localStorage.getItem("hearme_locale") || navigator.language || "en";
}

export function track(name: string, path = window.location.pathname) {
  send({ type: "click", name, path });
}

function send(body: { type: string; name?: string; path: string }) {
  const payload = {
    ...body,
    locale: locale(),
    device: device(),
    referrer: document.referrer || "direct",
  };
  const key = JSON.stringify(payload);
  const now = Date.now();
  const previous = send as typeof send & { last?: string; at?: number };
  if (previous.last === key && now - (previous.at || 0) < 800) return;
  previous.last = key;
  previous.at = now;
  fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    send({ type: "page", path: pathname });
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest("[data-track]");
      const name = target?.getAttribute("data-track");
      if (!name || window.location.pathname.startsWith("/admin")) return;
      send({ type: "click", name, path: window.location.pathname });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
