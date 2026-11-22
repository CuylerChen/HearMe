import type { MetadataRoute } from "next";
import { publicPaths, siteOrigin } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const updated = new Date();
  return publicPaths.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    lastModified: updated,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
