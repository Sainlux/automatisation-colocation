import { z } from "zod";
import { randomUUID } from "node:crypto";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { log } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/crypto";
import { bootstrapAccount } from "@/lib/auth/account";
import { setLocalSession, supabaseServer } from "@/lib/auth/session";
import { UniqueViolationError } from "@/lib/db/store";

/** Messages alignés sur ceux du formulaire d'inscription (src/app/(auth)/inscription). */
const MSG = {
  name: "Indiquez votre prénom et votre nom.",
  email: "Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch).",
  password: "Choisissez un mot de passe d'au moins 10 caractères.",
  exists: "Un compte existe déjà avec cet e-mail. Connectez-vous.",
  generic: "Inscription impossible pour le moment. Réessayez dans un instant.",
};

const schema = z.object({
  name: z.string({ error: MSG.name }).trim().min(2, MSG.name).max(120, "Le nom est trop long (120 caractères maximum)."),
  email: z.string({ error: MSG.email }).trim().toLowerCase().email(MSG.email),
  password: z.string({ error: MSG.password }).min(10, MSG.password).max(200, "Le mot de passe est trop long (200 caractères maximum)."),
  organizationName: z.string().trim().max(120, "Le nom de l'église est trop long (120 caractères maximum).").nullish(),
  /** Inscription depuis un lien d'invitation : pas d'espace personnel créé. */
  invited: z.boolean().optional().default(false),
});

/** Traduit les codes d'erreur de Supabase Auth en messages simples (le message brut reste dans les journaux). */
function signupErrorMessage(error: { code?: string; message?: string } | null): string {
  log("warn", "signup_failed", { code: error?.code ?? null, error: error?.message ?? "aucun utilisateur renvoyé" });
  switch (error?.code) {
    case "user_already_exists":
    case "email_exists":
      return MSG.exists;
    case "weak_password":
      return MSG.password;
    default:
      return MSG.generic;
  }
}

export const POST = api(
  async ({ req }) => {
    const input = await body(req, schema);
    const store = getStore();
    const options = { invited: input.invited };
    if (env.dataBackend === "supabase") {
      const sb = await supabaseServer();
      const { data, error } = await sb.auth.signUp({ email: input.email, password: input.password, options: { data: { display_name: input.name } } });
      if (error || !data.user) throw badRequest(signupErrorMessage(error));
      await bootstrapAccount(store, { id: data.user.id, email: input.email, name: input.name, organizationName: input.organizationName }, options);
      return { ok: true, needsEmailConfirmation: !data.session };
    }
    const [exists] = await store.select("local_users", { where: [["email", "eq", input.email]] });
    if (exists) throw badRequest(MSG.exists);
    const id = randomUUID();
    try {
      await store.insert("local_users", { id, email: input.email, password_hash: await hashPassword(input.password) });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw badRequest(MSG.exists);
      throw e;
    }
    await bootstrapAccount(store, { id, email: input.email, name: input.name, organizationName: input.organizationName }, options);
    await setLocalSession(id, input.email);
    return { ok: true, needsEmailConfirmation: false };
  },
  { auth: false, rateLimit: 10 },
);
