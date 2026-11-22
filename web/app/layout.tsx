import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/Analytics";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppState>
          <Analytics />
          {children}
        </AppState>
      </body>
    </html>
  );
}
