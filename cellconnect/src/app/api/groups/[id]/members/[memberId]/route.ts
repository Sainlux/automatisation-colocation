import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { removeGroupMember, updateGroupMember } from "@/lib/agents/group-agent";

export const PATCH = api(async ({ req, ctx, params }) => {
  const { role } = await body(req, z.object({ role: z.enum(["leader", "member", "guest"]) }));
  return { member: await updateGroupMember(ctx, params.id, params.memberId, role) };
});
export const DELETE = api(async ({ ctx, params }) => {
  await removeGroupMember(ctx, params.id, params.memberId);
  return { ok: true };
});
