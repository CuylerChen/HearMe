import { adminCookie, adminPassword, checkAdminPassword } from "@/lib/analytics";
import { json } from "@/lib/http";

export async function POST(request: Request) {
  if (!adminPassword()) return json({ error: "not_configured" }, 503);
  const body = await request.json().catch(() => ({}));
  if (!checkAdminPassword(String(body.password || ""))) return json({ error: "unauthorized" }, 401);
  return json({ ok: true }, 200, { "set-cookie": adminCookie(adminPassword()) });
}
