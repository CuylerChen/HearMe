import { recordFromRequest } from "@/lib/analytics";
import { json, withSetCookie } from "@/lib/http";
import { login, sessionCookie } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await login(String(body.email || ""), String(body.password || ""));
  if ("error" in result) return json(result, 401);
  const visitor = await recordFromRequest(request, { type: "conversion", name: "login_complete", path: "/login" });
  return withSetCookie(json({ user: result.user }, 200, { "set-cookie": sessionCookie(result.sessionId) }), visitor);
}
