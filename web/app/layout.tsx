import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Analytics } from "@/components/Analytics";
import { HtmlLang } from "@/components/HtmlLang";
import { AppState } from "@/components/AppState";
import { siteDescription, siteName, siteOrigin, siteTagline } from "@/lib/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  const title = `${siteName} — ${siteTagline}`;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s — HearMe" },
    description: siteDescription,
    applicationName: siteName,
    keywords: [
      "HearMe",
      "someone to talk to",
      "想找人说说话",
      "voice listening",
      "private space to be heard",
      "voice-first companion",
      "listen first",
      "no chat history",
    ],
    alternates: {
      types: { "text/plain": "/llms.txt" },
    },
    openGraph: {
      type: "website",
      siteName: siteName,
      title,
      description: siteDescription,
      url: origin,
      locale: "en_US",
      alternateLocale: ["zh_CN", "ja_JP", "ko_KR", "es_ES", "fr_FR"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: siteDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    manifest: "/manifest.json",
    category: "lifestyle",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F7F4",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const incoming = await headers();
  const lang = incoming.get("x-hearme-locale") === "zh-CN" ? "zh-CN" : "en";
  return (
    <html lang={lang} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppState>
          <HtmlLang />
          <Analytics />
          {children}
        </AppState>
      </body>
    </html>
  );
}
