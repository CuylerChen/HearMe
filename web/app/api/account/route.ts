import { json } from "@/lib/http";
import { clearCookie, deleteAccount } from "@/lib/store";

export async function DELETE(request: Request) {
  const result = await deleteAccount(request.headers.get("cookie"));
  if ("error" in result) return json(result, 401);
  return json(result, 200, { "set-cookie": clearCookie() });
}
