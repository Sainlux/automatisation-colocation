import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { unauthorized } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/crypto";
import { setLocalSession, supabaseServer } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const POST = api(
  async ({ req }) => {
    const { email, password } = await body(req, schema);
    const store = getStore();
    if (env.dataBackend === "supabase") {
      const { data, error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
      if (error || !data.user) throw unauthorized("E-mail ou mot de passe incorrect.");
      await audit(store, { orgId: null, actorId: data.user.id, action: "auth.login", entityType: "profile", entityId: data.user.id });
      return { ok: true };
    }
    const [user] = await store.select("local_users", { where: [["email", "eq", email]] });
    // Vérification systématique (même sans compte) pour limiter l'énumération par timing.
    const ok = await verifyPassword(password, user?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    if (!user || !ok) throw unauthorized("E-mail ou mot de passe incorrect.");
    await setLocalSession(user.id, user.email);
    await audit(store, { orgId: null, actorId: user.id, action: "auth.login", entityType: "profile", entityId: user.id });
    return { ok: true };
  },
  { auth: false, rateLimit: 10 },
);
