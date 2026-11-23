import { json, voiceBase, voiceHeaders } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

export async function GET(request: Request) {
  const user = await readSessionUser(request.headers.get("cookie"));
  if (!user) return json({ error: "unauthorized" }, 401);
  try {
    const response = await fetch(`${voiceBase()}/healthz`, { cache: "no-store", headers: voiceHeaders() });
    if (!response.ok) return json({ ok: false, cloudAvailable: false }, 200);
    return json({ ok: true, cloudAvailable: false, mode: "local" });
  } catch {
    return json({ ok: false, cloudAvailable: false }, 200);
  }
}
