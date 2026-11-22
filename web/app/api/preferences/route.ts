import { recordFromRequest } from "@/lib/analytics";
import { json, withSetCookie } from "@/lib/http";
import { savePreferences } from "@/lib/store";

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await savePreferences(request.headers.get("cookie"), body);
  if ("error" in result && result.error === "unauthorized") return json(result, 401);
  if ("error" in result) return json(result, 400);
  const visitor = body.onboardingDone === true
    ? await recordFromRequest(request, { type: "conversion", name: "onboarding_complete", path: "/onboarding" })
    : null;
  return withSetCookie(json(result), visitor);
}
