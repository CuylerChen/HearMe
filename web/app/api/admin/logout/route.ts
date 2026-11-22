import { clearAdminCookie } from "@/lib/analytics";
import { json } from "@/lib/http";

export async function POST() {
  return json({ ok: true }, 200, { "set-cookie": clearAdminCookie() });
}
