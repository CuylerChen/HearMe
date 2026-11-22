import type { MetadataRoute } from "next";
import { privatePaths, siteOrigin } from "@/lib/site";

const allow = ["/"];
const disallow = [...privatePaths];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  const rule = { allow, disallow };
  return {
    rules: [
      { userAgent: "*", ...rule },
      { userAgent: "GPTBot", ...rule },
      { userAgent: "OAI-SearchBot", ...rule },
      { userAgent: "ChatGPT-User", ...rule },
      { userAgent: "Google-Extended", ...rule },
      { userAgent: "PerplexityBot", ...rule },
      { userAgent: "ClaudeBot", ...rule },
      { userAgent: "Applebot-Extended", ...rule },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
