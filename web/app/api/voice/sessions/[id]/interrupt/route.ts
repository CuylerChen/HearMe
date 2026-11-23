import { json, voiceBase, voiceHeaders } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await readSessionUser(request.headers.get("cookie")))) return json({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  const upstream = await fetch(`${voiceBase()}/v1/sessions/${id}/interrupt`, {
    method: "POST",
    headers: voiceHeaders({ "content-type": "application/json" }),
    body: "{}",
  }).catch(() => null);
  if (!upstream) return json({ error: "voice_unavailable" }, 503);
  return json(await upstream.json().catch(() => ({ state: "interrupted" })), upstream.status);
}
