import { recordFromRequest } from "@/lib/analytics";
import { json, voiceBase, voiceHeaders, withSetCookie } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

async function authorized(request: Request) {
  return readSessionUser(request.headers.get("cookie"));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  const upstream = await fetch(`${voiceBase()}/v1/sessions/${id}`, { cache: "no-store", headers: voiceHeaders() }).catch(() => null);
  if (!upstream) return json({ error: "voice_unavailable" }, 503);
  return json(await upstream.json().catch(() => ({})), upstream.status);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  const upstream = await fetch(`${voiceBase()}/v1/sessions/${id}`, { method: "DELETE", headers: voiceHeaders() }).catch(() => null);
  if (!upstream) return json({ error: "voice_unavailable" }, 503);
  const body = await upstream.json().catch(() => ({ state: "closed" }));
  const visitor = upstream.ok
    ? await recordFromRequest(request, { type: "conversion", name: "session_end", path: "/session/end" })
    : null;
  return withSetCookie(json(body, upstream.status), visitor);
}
