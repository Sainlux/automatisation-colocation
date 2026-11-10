import { z } from "zod";
import { randomUUID } from "node:crypto";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/crypto";
import { bootstrapAccount } from "@/lib/auth/account";
import { setLocalSession, supabaseServer } from "@/lib/auth/session";
import { UniqueViolationError } from "@/lib/db/store";

const schema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  email: z.string().trim().toLowerCase().email("E-mail invalide"),
  password: z.string().min(10, "10 caractères minimum").max(200),
  organizationName: z.string().trim().max(120).nullish(),
});

export const POST = api(
  async ({ req }) => {
    const input = await body(req, schema);
    const store = getStore();
    if (env.dataBackend === "supabase") {
      const sb = await supabaseServer();
      const { data, error } = await sb.auth.signUp({ email: input.email, password: input.password, options: { data: { display_name: input.name } } });
      if (error || !data.user) throw badRequest(error?.message ?? "Inscription impossible.");
      await bootstrapAccount(store, { id: data.user.id, email: input.email, name: input.name, organizationName: input.organizationName });
      return { ok: true, needsEmailConfirmation: !data.session };
    }
    const [exists] = await store.select("local_users", { where: [["email", "eq", input.email]] });
    if (exists) throw badRequest("Un compte existe déjà avec cet e-mail.");
    const id = randomUUID();
    try {
      await store.insert("local_users", { id, email: input.email, password_hash: await hashPassword(input.password) });
    } catch (e) {
      if (e instanceof UniqueViolationError) throw badRequest("Un compte existe déjà avec cet e-mail.");
      throw e;
    }
    await bootstrapAccount(store, { id, email: input.email, name: input.name, organizationName: input.organizationName });
    await setLocalSession(id, input.email);
    return { ok: true, needsEmailConfirmation: false };
  },
  { auth: false, rateLimit: 10 },
);
