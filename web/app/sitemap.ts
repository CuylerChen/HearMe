import type { MetadataRoute } from "next";
import { guides } from "@/lib/promote";
import { publicPaths, siteOrigin } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const updated = new Date();
  const paths = [...publicPaths, ...guides.map((guide) => guide.path)];
  return paths.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    lastModified: updated,
    changeFrequency: path === "/" || path === "/listen" || path === "/zh" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/listen" || path === "/zh" ? 0.8 : 0.6,
  }));
}
