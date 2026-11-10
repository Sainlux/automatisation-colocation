import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { setActiveOrg } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().trim().min(2).max(120) });

export const POST = api(async ({ req, ctx }) => {
  const { name } = await body(req, schema);
  const slug = `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org"}-${crypto.randomUUID().slice(0, 8)}`;
  const org = await ctx.store.insert("organizations", { name, slug, created_by: ctx.userId });
  await ctx.store.insert("organization_members", { organization_id: org.id, user_id: ctx.userId, role: "org_admin" });
  await audit(ctx.store, { orgId: org.id, actorId: ctx.userId, action: "org.created", entityType: "organization", entityId: org.id });
  await setActiveOrg(org.id);
  return { organization: org };
});
