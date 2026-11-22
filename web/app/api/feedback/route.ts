import { json } from "@/lib/http";
import { rejectContentFields } from "@/lib/privacy-boundary";
import { saveFeedback } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rejected = rejectContentFields(body);
  if (rejected) return json({ error: rejected }, 400);
  const result = await saveFeedback(request.headers.get("cookie"), Number(body.rating));
  if ("error" in result && result.error === "unauthorized") return json(result, 401);
  if ("error" in result) return json(result, 400);
  return json(result);
}
