import { adminAllowed } from "@/lib/analytics";
import { json } from "@/lib/http";
import { listAccounts } from "@/lib/store";

export async function GET(request: Request) {
  if (!adminAllowed(request.headers.get("cookie"))) return json({ error: "unauthorized" }, 401);
  return json({ accounts: listAccounts() });
}
