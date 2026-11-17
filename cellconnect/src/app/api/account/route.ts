import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { deleteAccountData } from "@/lib/auth/account";
import { clearSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/db";
import { errMsg } from "@/lib/errors";
import { deleteObject } from "@/lib/storage";

const schema = z.object({ confirm: z.literal("SUPPRIMER", { error: "Saisissez SUPPRIMER pour confirmer." }) });

/** Supprime tous les fichiers stockés sous le dossier d'une organisation effacée (`<orgId>/…`). */
async function removeOrganizationFolder(orgId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return;
  if (env.dataBackend === "supabase") {
    const bucket = supabaseAdmin().storage.from(env.supabase.bucket);
    // Arborescence : <orgId>/<userId>/<fichier>.
    const { data: folders } = await bucket.list(orgId, { limit: 1000 });
    for (const f of folders ?? []) {
      const { data: files } = await bucket.list(`${orgId}/${f.name}`, { limit: 1000 });
      const paths = (files ?? []).map((x) => `${orgId}/${f.name}/${x.name}`);
      if (paths.length) await bucket.remove(paths);
    }
    return;
  }
  await fs.rm(path.resolve(env.dataDir, "uploads", orgId), { recursive: true, force: true });
}

/** Suppression définitive du compte et des données personnelles. */
export const DELETE = api(
  async ({ req, ctx }) => {
    await body(req, schema);
    const uploads = await ctx.store.select("uploads", { where: [["user_id", "eq", ctx.userId]] });
    // Effacement en base d'abord : il est refusé si l'utilisateur est le seul administrateur d'une église partagée.
    const { deletedOrganizations } = await deleteAccountData(ctx.store, ctx.userId);
    for (const u of uploads) if (u.storage_path) await deleteObject(u.storage_path).catch(() => undefined);
    for (const orgId of deletedOrganizations) {
      await removeOrganizationFolder(orgId).catch((e) => log("warn", "account_storage_cleanup_failed", { orgId, error: errMsg(e) }));
    }
    if (env.dataBackend === "supabase") await supabaseAdmin().auth.admin.deleteUser(ctx.userId);
    else if (await ctx.store.get("local_users", ctx.userId)) await ctx.store.delete("local_users", ctx.userId);
    await clearSession();
    return { ok: true };
  },
  { rateLimit: 3 },
);
