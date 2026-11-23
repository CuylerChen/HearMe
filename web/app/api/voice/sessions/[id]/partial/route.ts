import { json, voiceBase, voiceHeaders } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await readSessionUser(request.headers.get("cookie")))) return json({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  const incoming = await request.json().catch(() => ({}));
  const upstream = await fetch(`${voiceBase()}/v1/sessions/${id}/partial`, {
    method: "POST",
    headers: voiceHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ pcm16k_b64: incoming.pcm16k_b64 }),
  }).catch(() => null);
  if (!upstream) return json({ error: "voice_unavailable" }, 503);
  return json({ ok: upstream.ok }, upstream.ok ? 204 : upstream.status);
}
