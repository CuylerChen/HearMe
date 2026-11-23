export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function withSetCookie(response: Response, cookie: string | null) {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export function voiceBase() {
  return process.env.VOICE_API_BASE || "http://127.0.0.1:18200";
}

export function voiceHeaders(extra: Record<string, string> = {}) {
  const headers = { ...extra };
  const key = process.env.VOICE_API_KEY;
  if (key) headers["X-Api-Key"] = key;
  return headers;
}
