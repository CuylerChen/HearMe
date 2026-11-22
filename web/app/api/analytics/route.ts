import { analyticsSummary, adminAllowed, normalizeEvent, recordFromRequest } from "@/lib/analytics";
import { json } from "@/lib/http";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const normalized = normalizeEvent(body);
  if (!normalized) return json({ ok: true });
  const cookie = await recordFromRequest(request, {
    ...normalized,
    referrer: String(body.referrer || ""),
  });
  return json({ ok: true }, 200, cookie ? { "set-cookie": cookie } : {});
}

export async function GET(request: Request) {
  if (!adminAllowed(request.headers.get("cookie"))) return json({ error: "unauthorized" }, 401);
  const days = new URL(request.url).searchParams.get("days") === "30" ? 30 : 7;
  return json(await analyticsSummary(days));
}
