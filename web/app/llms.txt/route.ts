import { llmsText, siteOrigin } from "@/lib/site";

export async function GET() {
  const origin = await siteOrigin();
  return new Response(llmsText(origin), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
