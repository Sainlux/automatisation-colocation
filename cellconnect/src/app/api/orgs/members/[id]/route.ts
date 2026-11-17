import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { updateOrgMemberRole } from "@/lib/agents/group-agent";

const schema = z.object({ role: z.enum(["org_admin", "group_leader", "member", "guest"]) });
export const PATCH = api(async ({ req, ctx, params }) => {
  const { role } = await body(req, schema);
  return { member: await updateOrgMemberRole(ctx, params.id, role) };
});
