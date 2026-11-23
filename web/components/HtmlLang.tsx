"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function HtmlLang() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = pathname === "/zh" || pathname.startsWith("/zh/") ? "zh-CN" : "en";
  }, [pathname]);
  return null;
}
