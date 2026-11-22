import { json } from "@/lib/http";
import { completeReset, createReset } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "");
  if (body.code) {
    if (String(body.password || "").length < 8) return json({ error: "password_short" }, 400);
    const result = await completeReset(email, String(body.code), String(body.password));
    if ("error" in result) return json(result, 400);
    return json(result);
  }
  const result = await createReset(email);
  if ("error" in result) return json(result, 404);
  return json(result);
}
