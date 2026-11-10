import { api } from "@/lib/http/api";
import { clearSession } from "@/lib/auth/session";

export const POST = api(async () => {
  await clearSession();
  return { ok: true };
}, { auth: false });
