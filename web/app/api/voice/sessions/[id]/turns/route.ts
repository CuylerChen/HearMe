import { voiceBase } from "@/lib/http";
import { listenerFor, listenerManner, listenerName } from "@/lib/listeners";
import { readSessionUser } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await readSessionUser(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const incoming = await request.json().catch(() => ({}));
  const prefs = user.preferences;
  const person = listenerFor(String(incoming.listener_id || ""));
  const locale = prefs.interfaceLocale;
  const upstream = await fetch(`${voiceBase()}/v1/sessions/${id}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pcm16k_b64: incoming.pcm16k_b64,
      voice_key: person.voiceKey,
      listen_more: prefs.listenMore,
      ask_questions: prefs.askQuestions,
      short: prefs.shortResponses,
      gentle: prefs.gentleTone,
      listener_id: person.id,
      listener_name: listenerName(person.id, locale),
      manner: listenerManner(person.id, locale),
      speaker_zh: person.speakerZh,
      speaker_en: person.speakerEn,
    }),
  }).catch(() => null);
  if (!upstream) return Response.json({ error: "voice_unavailable" }, { status: 503 });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
