import { json } from "@/lib/http";
import { clearCookie, logout } from "@/lib/store";

export async function POST(request: Request) {
  await logout(request.headers.get("cookie"));
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
}
