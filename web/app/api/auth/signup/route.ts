import { recordFromRequest } from "@/lib/analytics";
import { json, withSetCookie } from "@/lib/http";
import { sessionCookie, signup } from "@/lib/store";
import { LOCALES, type Locale } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "");
  const password = String(body.password || "");
  const locale = LOCALES.includes(body.locale) ? (body.locale as Locale) : "en";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (password.length < 8) return json({ error: "password_short" }, 400);
  const result = await signup(email, password, locale);
  if ("error" in result) return json(result, 409);
  const visitor = await recordFromRequest(request, { type: "conversion", name: "signup_complete", path: "/signup", locale });
  return withSetCookie(json({ user: result.user }, 201, { "set-cookie": sessionCookie(result.sessionId) }), visitor);
}
