import { recordFromRequest } from "@/lib/analytics";
import { json, withSetCookie } from "@/lib/http";
import { rejectContentFields } from "@/lib/privacy-boundary";
import { deleteMood, listMoods, saveMood } from "@/lib/store";

export async function GET(request: Request) {
  const result = await listMoods(request.headers.get("cookie"));
  if ("error" in result) return json(result, 401);
  return json(result);
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rejected = rejectContentFields(body);
  if (rejected) return json({ error: rejected }, 400);
  const result = await saveMood(request.headers.get("cookie"), String(body.date || ""), Number(body.level));
  if ("error" in result && result.error === "unauthorized") return json(result, 401);
  if ("error" in result) return json(result, 400);
  const visitor = await recordFromRequest(request, { type: "conversion", name: "mood_saved", path: "/mood" });
  return withSetCookie(json(result), visitor);
}

export async function DELETE(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || "";
  const result = await deleteMood(request.headers.get("cookie"), date);
  if ("error" in result) return json(result, 401);
  return json(result);
}
