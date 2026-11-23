import { recordFromRequest } from "@/lib/analytics";
import { json, voiceBase, voiceHeaders, withSetCookie } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

export async function POST(request: Request) {
  const user = await readSessionUser(request.headers.get("cookie"));
  if (!user) return json({ error: "unauthorized" }, 401);
  const prefs = user.preferences;
  const upstream = await fetch(`${voiceBase()}/v1/sessions`, {
    method: "POST",
    headers: voiceHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      conversation_language_mode: prefs.conversationLanguageMode,
      preferred_conversation_locale: prefs.preferredConversationLocale,
      voice_key: prefs.voiceKey,
    }),
  }).catch(() => null);
  if (!upstream) {
    console.log(JSON.stringify({ event: "voice_session", ok: false, status: 0 }));
    return json({ error: "voice_unavailable" }, 503);
  }
  const body = await upstream.json().catch(() => ({ error: "voice_unavailable" }));
  console.log(JSON.stringify({ event: "voice_session", ok: upstream.ok, status: upstream.status, session: body.session_id || "" }));
  const visitor = upstream.ok
    ? await recordFromRequest(request, { type: "conversion", name: "session_start", path: "/session" })
    : null;
  return withSetCookie(json(body, upstream.status), visitor);
}
