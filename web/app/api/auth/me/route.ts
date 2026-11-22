import { json } from "@/lib/http";
import { readSessionUser } from "@/lib/store";

export async function GET(request: Request) {
  const user = await readSessionUser(request.headers.get("cookie"));
  if (!user) return json({ user: null }, 401);
  return json({ user });
}
