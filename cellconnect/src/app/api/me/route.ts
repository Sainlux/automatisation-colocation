import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { integrationStatus } from "@/lib/env";
import { isValidTimezone } from "@/lib/time";
import { audit } from "@/lib/audit";

export const GET = api(async ({ ctx }) => {
  const profile = await ctx.store.get("profiles", ctx.userId);
  const memberships = await ctx.store.select("organization_members", { where: [["user_id", "eq", ctx.userId]] });
  const orgs = memberships.length ? await ctx.store.select("organizations", { where: [["id", "in", memberships.map((m) => m.organization_id)]] }) : [];
  return {
    profile,
    organization: orgs.find((o) => o.id === ctx.orgId) ?? null,
    role: ctx.orgRole,
    organizations: orgs.map((o) => ({ id: o.id, name: o.name, role: memberships.find((m) => m.organization_id === o.id)?.role })),
    integrations: integrationStatus(),
  };
});

const patchSchema = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().refine(isValidTimezone, "Fuseau invalide").optional(),
  reminder_offsets: z.array(z.number().int().min(5).max(40320)).max(6).optional(),
  travel_buffer_minutes: z.number().int().min(0).max(240).optional(),
  notify_email: z.boolean().optional(),
  delete_captures_after_analysis: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
});

export const PATCH = api(async ({ req, ctx }) => {
  const patch = await body(req, patchSchema);
  const profile = await ctx.store.update("profiles", ctx.userId, patch);
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "profile.updated", entityType: "profile", entityId: ctx.userId, metadata: { fields: Object.keys(patch) } });
  return { profile };
});
