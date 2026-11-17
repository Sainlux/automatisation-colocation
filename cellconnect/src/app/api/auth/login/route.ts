import { z } from "zod";
import { api, body, sharedRateLimit } from "@/lib/http/api";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { AppError, unauthorized } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/crypto";
import { setLocalSession, supabaseServer } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch)."),
  password: z.string().min(1, "Saisissez votre mot de passe.").max(200),
});

/** Seconde limite, par compte visé : 5 essais par 15 minutes (en plus de la limite par IP). */
const LOGIN_TRIES_PER_EMAIL = 5;
const LOGIN_WINDOW_MINUTES = 15;

async function checkLoginBudget(email: string) {
  if (!(await sharedRateLimit(`login:${email}`, LOGIN_TRIES_PER_EMAIL, LOGIN_WINDOW_MINUTES * 60))) {
    throw new AppError(429, "rate_limited", "Trop de tentatives pour ce compte. Patientez un quart d'heure, puis réessayez.");
  }
}

export const POST = api(
  async ({ req }) => {
    const { email, password } = await body(req, schema);
    await checkLoginBudget(email);
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
