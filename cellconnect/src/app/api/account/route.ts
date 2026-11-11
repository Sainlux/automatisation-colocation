import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { deleteAccountData } from "@/lib/auth/account";
import { clearSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { deleteObject } from "@/lib/storage";

/** Suppression définitive du compte et des données personnelles. */
export const DELETE = api(async ({ req, ctx }) => {
  const { confirm } = await body(req, z.object({ confirm: z.literal("SUPPRIMER") }).catch({ confirm: "" as never }));
  if (confirm !== "SUPPRIMER") throw badRequest("Saisissez SUPPRIMER pour confirmer.");
  const uploads = await ctx.store.select("uploads", { where: [["user_id", "eq", ctx.userId]] });
  for (const u of uploads) if (u.storage_path) await deleteObject(u.storage_path).catch(() => undefined);
  await deleteAccountData(ctx.store, ctx.userId);
  if (env.dataBackend === "supabase") await supabaseAdmin().auth.admin.deleteUser(ctx.userId);
  else {
    const [u] = await ctx.store.select("local_users", { where: [["id", "eq", ctx.userId]] });
    if (u) await ctx.store.delete("local_users", u.id);
  }
  await clearSession();
  return { ok: true };
}, { rateLimit: 3 });
