import { voiceBase, voiceHeaders } from "@/lib/http";
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
  const started = Date.now();
  const pcmChars = String(incoming.pcm16k_b64 || incoming.tail_b64 || "").length;
  const payload = JSON.stringify({
    pcm16k_b64: incoming.use_buffer ? "" : incoming.pcm16k_b64,
    tail_b64: incoming.tail_b64 || "",
    use_buffer: Boolean(incoming.use_buffer),
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
  });
  const headers = voiceHeaders({ "content-type": "application/json" });
  async function postTurn(sessionId: string) {
    return fetch(`${voiceBase()}/v1/sessions/${sessionId}/turns`, {
      method: "POST",
      headers,
      body: payload,
    }).catch(() => null);
  }
  let sessionId = id;
  let upstream = await postTurn(sessionId);
  if (upstream && upstream.status === 404) {
    const created = await fetch(`${voiceBase()}/v1/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_language_mode: prefs.conversationLanguageMode,
        preferred_conversation_locale: prefs.preferredConversationLocale,
        voice_key: person.voiceKey,
      }),
    }).catch(() => null);
    const createdBody = created && created.ok ? await created.json().catch(() => ({})) : {};
    const nextId = String(createdBody.session_id || "");
    if (nextId) {
      sessionId = nextId;
      upstream = await postTurn(sessionId);
    }
  }
  console.log(JSON.stringify({
    event: "voice_turn",
    session: sessionId,
    from: id,
    pcm: pcmChars,
    ms: Date.now() - started,
    status: upstream?.status ?? 0,
    ok: Boolean(upstream?.ok),
  }));
  if (!upstream) return Response.json({ error: "voice_unavailable" }, { status: 503 });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
